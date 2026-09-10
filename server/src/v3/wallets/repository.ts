import { createResourceId, evmChainId, parseNetworkId, parseResourceId, type ResourceId } from '../../../../shared/v3/primitives';
import { requireHash } from '../../../../shared/v3/deployment';
import { deriveAccountId } from '../../../../shared/v3/authorizations';
import { isAddress } from 'viem';
import type { VerifiedIdentity } from '../auth/identity';

export class WalletAccessError extends Error {
	constructor(readonly code: 'SESSION_REQUIRED' | 'UNAUTHENTICATED' | 'NOT_FOUND' | 'WALLET_DATA_INVALID') {
		super(code); this.name = 'WalletAccessError';
	}
}

type Row = Record<string, unknown>;
type Page = { readonly limit: number; readonly after: string };
const SESSION = `SELECT u.id AS user_id, p.id AS party_id, u.disabled_at, u.auth_not_before
	FROM user_identities u LEFT JOIN parties p ON p.user_id = u.id AND p.kind = 'individual'
	WHERE u.firebase_project_id = ? AND u.firebase_subject = ?`;
const OWNERSHIP = `JOIN parties p ON p.id = w.owner_party_id AND p.kind = 'individual'
	JOIN user_identities u ON u.id = p.user_id`;
const AUTHORIZED = `u.firebase_project_id = ? AND u.firebase_subject = ?
	AND u.disabled_at IS NULL AND u.auth_not_before <= ?`;

function session(rows: Row[], identity: VerifiedIdentity) {
	if (rows.length === 0) throw new WalletAccessError('SESSION_REQUIRED');
	const row = rows[0];
	if (rows.length !== 1 || !Number.isSafeInteger(row.auth_not_before) || typeof row.auth_not_before !== 'number'
		|| row.auth_not_before < 0) throw new WalletAccessError('WALLET_DATA_INVALID');
	if (row.disabled_at !== null || identity.authTime < row.auth_not_before
		|| identity.expiresAt <= Math.floor(Date.now() / 1000)) throw new WalletAccessError('UNAUTHENTICATED');
	try { return { user_id: parseResourceId('user', row.user_id), party_id: parseResourceId('party', row.party_id) }; }
	catch { throw new WalletAccessError('WALLET_DATA_INVALID'); }
}

function wallet(row: Row) {
	const id = parseResourceId('wallet', row.id);
	if (row.controller !== 'end_user' || row.account_kind !== 'evm_smart_account'
		|| (row.status !== 'active' && row.status !== 'archived')) throw new Error('Invalid wallet');
	return { id, owner_party_id: parseResourceId('party', row.owner_party_id), controller: row.controller,
		account_kind: row.account_kind, status: row.status };
}

function account(row: Row) {
	const id = parseResourceId('walletAccount', row.id);
	const network = parseNetworkId(row.network_id);
	evmChainId(network);
	if (row.generation !== 3 || !['counterfactual', 'deploying', 'active', 'needs_security_sync', 'unsupported', 'retired'].includes(String(row.deployment_state))) {
		throw new Error('Invalid account instance');
	}
	return { id, wallet_id: parseResourceId('wallet', row.wallet_id), account_identity_id: parseResourceId('accountIdentity', row.account_identity_id),
		network_id: network, generation: 3 as const, deployment_state: String(row.deployment_state),
		// D1 is a projection. It must not expose an unverified deposit address or authorize a payment.
		spend_readiness: 'not_assessed' as const, receive_enabled: false as const };
}

function pageResult<T extends { id: string }>(rows: Row[], page: Page, parse: (row: Row) => T) {
	const data = rows.slice(0, page.limit).map(parse);
	return { data, next_cursor: rows.length > page.limit ? data.at(-1)!.id : null };
}

/** Created per request. All ownership reads start on primary and use a transactional batch.
 * Firebase project+subject is the login identity, never email or a client-provided Party.
 * This repository does not enroll a signer, create an onchain account or reserve any funds.
 */
export class WalletRepository {
	private readonly db: D1DatabaseSession;
	constructor(database: D1Database, private readonly identity: VerifiedIdentity) {
		this.db = database.withSession('first-primary');
	}
	private sessionQuery() { return this.db.prepare(SESSION).bind(this.identity.projectId, this.identity.subject); }
	private authValues() { return [this.identity.projectId, this.identity.subject, this.identity.authTime] as const; }
	private async read(statements: D1PreparedStatement[]): Promise<Row[][]> {
		const results = await this.db.batch<Row>(statements);
		if (results.length !== statements.length || results.some((result) => !result.success || !Array.isArray(result.results))) {
			throw new WalletAccessError('WALLET_DATA_INVALID');
		}
		return results.map((result) => result.results);
	}
	async getSession() { return session((await this.read([this.sessionQuery()]))[0], this.identity); }
	async ensureSession() {
		const now = Math.floor(Date.now() / 1000);
		const result = await this.read([
			this.db.prepare(`INSERT INTO user_identities (id, firebase_project_id, firebase_subject, created_at)
				VALUES (?, ?, ?, ?) ON CONFLICT(firebase_project_id, firebase_subject) DO NOTHING`)
				.bind(createResourceId('user'), this.identity.projectId, this.identity.subject, now),
			this.db.prepare(`INSERT INTO parties (id, kind, user_id, created_at)
				SELECT ?, 'individual', u.id, ? FROM user_identities u WHERE ${AUTHORIZED}
				ON CONFLICT(user_id) DO NOTHING`).bind(createResourceId('party'), now, ...this.authValues()),
			this.sessionQuery(),
		]);
		return session(result[2], this.identity);
	}
	async listWallets(page: Page) {
		const result = await this.read([this.sessionQuery(), this.db.prepare(`SELECT w.* FROM wallets w ${OWNERSHIP}
			WHERE ${AUTHORIZED} AND w.id > ? ORDER BY w.id LIMIT ?`).bind(...this.authValues(), page.after, page.limit + 1)]);
		session(result[0], this.identity);
		try { return pageResult(result[1], page, wallet); }
		catch { throw new WalletAccessError('WALLET_DATA_INVALID'); }
	}
	async listAccounts(walletId: ResourceId<'wallet'>, page: Page) {
		const result = await this.read([this.sessionQuery(), this.walletQuery(walletId), this.db.prepare(`SELECT a.*, i.generation, i.deployment_state
			FROM wallet_accounts a JOIN wallets w ON w.id = a.wallet_id ${OWNERSHIP}
			JOIN account_instances i ON i.account_identity_id = a.account_identity_id AND i.network_id = a.network_id
			WHERE ${AUTHORIZED} AND w.id = ? AND a.id > ? ORDER BY a.id LIMIT ?`)
			.bind(...this.authValues(), walletId, page.after, page.limit + 1)]);
		session(result[0], this.identity);
		if (result[1].length === 0) throw new WalletAccessError('NOT_FOUND');
		try { wallet(result[1][0]); return pageResult(result[2], page, account); }
		catch { throw new WalletAccessError('WALLET_DATA_INVALID'); }
	}
	private walletQuery(id: ResourceId<'wallet'>) {
		return this.db.prepare(`SELECT w.* FROM wallets w ${OWNERSHIP} WHERE ${AUTHORIZED} AND w.id = ?`).bind(...this.authValues(), id);
	}
	/** Internal resolver for inspection/execution. Never serialize commitments/pins blindly to UI. */
	async ownedAccount(walletId: ResourceId<'wallet'>, accountId: ResourceId<'walletAccount'>) {
		const result = await this.read([this.sessionQuery(), this.db.prepare(`SELECT a.*, i.generation, i.deployment_state,
			i.deployment_manifest_sha256, i.address, c.account_id, c.initial_security_commitment, c.user_salt_commitment,
			w.controller, w.account_kind, w.status AS wallet_status
			FROM wallet_accounts a JOIN wallets w ON w.id = a.wallet_id ${OWNERSHIP}
			JOIN account_instances i ON i.account_identity_id = a.account_identity_id AND i.network_id = a.network_id
			JOIN account_identities c ON c.id = a.account_identity_id AND c.wallet_id = w.id AND c.canonical_address = i.address
			WHERE ${AUTHORIZED} AND w.id = ? AND a.id = ?`).bind(...this.authValues(), walletId, accountId)]);
		session(result[0], this.identity);
		if (result[1].length === 0) throw new WalletAccessError('NOT_FOUND');
		try {
			const row = result[1][0];
			const view = account(row);
			if (row.controller !== 'end_user' || row.account_kind !== 'evm_smart_account' || row.wallet_status !== 'active'
				|| view.deployment_state === 'unsupported' || view.deployment_state === 'retired'
				|| typeof row.address !== 'string' || !isAddress(row.address, { strict: true })
				|| row.address !== row.address.toLowerCase() || /^0x0+$/.test(row.address)) throw new Error('Invalid account');
			requireHash(row.account_id); requireHash(row.initial_security_commitment); requireHash(row.user_salt_commitment);
			requireHash(row.deployment_manifest_sha256);
			if (deriveAccountId(row.initial_security_commitment, row.user_salt_commitment) !== row.account_id) throw new Error('Invalid identity');
			return Object.freeze({ ...view, address: row.address, account_id: row.account_id,
				initial_security_commitment: row.initial_security_commitment, user_salt_commitment: row.user_salt_commitment,
				deployment_manifest_sha256: row.deployment_manifest_sha256 });
		} catch { throw new WalletAccessError('WALLET_DATA_INVALID'); }
	}
}
