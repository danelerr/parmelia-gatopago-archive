import { zeroHash } from 'viem';
import { hashSecurityManifest } from '../../../../shared/v3/authorizations';
import { deploymentDocumentDigest } from '../../../../shared/v3/deployment';
import { loadPinnedFinalityPolicy, type FinalityPolicyPin } from '../../../../shared/v3/finality';
import { loadPinnedCreationProfile } from '../../../../shared/v3/initialization';
import { createResourceId, parseResourceId, type ResourceId } from '../../../../shared/v3/primitives';
import { inspectFinalizedWalletSecurity } from '../finalizedSecurityInspection';
import { creationProviderUrl } from './creationBundler';
import { CreationDeliveryRepository, type CreationDeliveryConfiguration } from './creationDelivery';
import { CreationObservationJournal } from './creationObservationJournal';
import type { CreationProfilePin } from './initialization';
import { WalletAccessError } from './repository';

interface Network extends CreationProfilePin {
	readonly finalityPolicy: FinalityPolicyPin;
	readonly providers: readonly { readonly operatorId: string; readonly url: string }[];
}
interface Configuration extends Omit<CreationDeliveryConfiguration, 'profiles'> { readonly networks: readonly Network[] }
type Row = Record<string, unknown>;
const invalid = () => new WalletAccessError('WALLET_DATA_INVALID');

/** Internal projection of an already consented, sent and finalized creation.
 * Never sends, invents a Firebase session, activates a security policy or admits a
 * network. A revoked login does not erase the economic result of an earlier send.
 * Historical projection is idempotent; spending/receiving still need fresh checks.
 */
export async function processCreationProjection(database: D1Database, id: ResourceId<'operation'>,
	configuration: Configuration, signal: AbortSignal) {
	parseResourceId('operation', id);
	if (configuration.networks.length > 32) throw new Error('Too many projection networks');
	const networks = configuration.networks.map((network) => {
		const profile = loadPinnedCreationProfile(network.document, network.digest);
		const finalityPolicy = Object.freeze({ ...network.finalityPolicy });
		loadPinnedFinalityPolicy(finalityPolicy, profile.deployment);
		if (network.providers.length !== 2) throw new Error('Exactly two projection observers required');
		const providers = network.providers.map((p) => {
			if (!/^[a-z][a-z0-9_-]{1,63}$(?![\s\S])/.test(p.operatorId)) throw new Error('Invalid projection observer');
			return Object.freeze({ operatorId: p.operatorId, url: creationProviderUrl(p.url) });
		});
		if (new Set(providers.map((p) => p.operatorId)).size !== 2
			|| new Set(providers.map((p) => new URL(p.url).hostname)).size !== 2) throw new Error('Projection observers overlap');
		return Object.freeze({ document: network.document, digest: network.digest, finalityPolicy, providers: Object.freeze(providers) });
	});
	const config = Object.freeze({ firebaseProjectId: configuration.firebaseProjectId,
		scope: Object.freeze({ ...configuration.scope }), profiles: Object.freeze(networks) });
	const grants = new CreationDeliveryRepository(database, config), journal = new CreationObservationJournal(database, config);
	const db = database.withSession('first-primary');
	signal.throwIfAborted();
	const grant = await grants.observationGrant(id);
	if (!grant) return 'pending' as const;
	const prepared = grant.signed.prepared, message = prepared.message;
	const network = networks.find((n) => n.digest === prepared.profileDigest);
	if (!network) throw invalid();
	const address = prepared.account.toLowerCase(), networkId = prepared.profile.deployment.network_id;
	const deployment = JSON.stringify(prepared.profile.deployment), deploymentDigest = deploymentDocumentDigest(deployment);
	async function existing() {
		const row = await db.prepare(`SELECT x.*, a.wallet_id AS actual_wallet, a.account_identity_id AS actual_identity,
			a.network_id, c.account_id, c.canonical_address, w.owner_party_id, p.user_id, i.user_id AS initial_user
			FROM account_creation_projections x JOIN wallet_accounts a ON a.id = x.wallet_account_id
			JOIN account_identities c ON c.id = a.account_identity_id JOIN wallets w ON w.id = a.wallet_id
			JOIN parties p ON p.id = w.owner_party_id JOIN account_initializations i ON i.id = x.initialization_id
			WHERE x.initialization_id = ?`).bind(id).first<Row>();
		if (!row) return false;
		if (row.wallet_id !== row.actual_wallet || row.account_identity_id !== row.actual_identity
			|| row.user_id !== row.initial_user || row.network_id !== networkId || row.account_id !== message.accountId
			|| row.canonical_address !== address || typeof row.security_json !== 'string'
			|| deploymentDocumentDigest(row.security_json) !== row.security_sha256) throw invalid();
		return true;
	}
	if (await existing()) return 'already_projected' as const;
	const source = await journal.latest(id);
	if (!source || source.result.status !== 'observed' || source.result.finality !== 'finalized'
		|| source.result.observation.outcome !== 'creation_succeeded') return 'pending' as const;
	const expectedManifest = hashSecurityManifest({ accountId: message.accountId, generation: 3, securityVersion: 1n,
		previousManifestHash: zeroHash, policyHash: message.initialSecurityCommitment, chainScopeHash: message.chainScopeHash });
	if (source.result.observation.initial_manifest_hash !== expectedManifest
		|| [...source.result.provider_ids].sort().join(',') !== network.providers.map((p) => p.operatorId).sort().join(',')) throw invalid();
	const security = await inspectFinalizedWalletSecurity({ document: deployment, expectedDigest: deploymentDigest,
		initialSecurityCommitment: message.initialSecurityCommitment, userSaltCommitment: message.userSaltCommitment,
		rpcUrls: network.providers.map((p) => p.url), finalityPolicy: network.finalityPolicy,
		finalityEvidence: source.result.finality_evidence }, signal);
	if (!('security' in security) || security.status !== 'recognized' || security.security_version !== '1'
		|| security.security.phase !== 'active_policy' || security.security.manifest_hash !== expectedManifest
		|| security.security.policy_hash !== message.initialSecurityCommitment || security.security.chain_scope_hash !== message.chainScopeHash
		|| security.security.pending !== null || security.security.upgrades_frozen
		|| Object.values(security.security.nonces).some((nonce) => nonce !== '0')) throw new Error('CREATION_SECURITY_CHANGED');
	// Restore the immutable, signed grant after slow I/O; never project from a stale
	// combination of consent and RPC state. SQL below additionally pins the journal head.
	const currentGrant = await grants.observationGrant(id);
	if (!currentGrant || currentGrant.signed.digest !== grant.signed.digest
		|| currentGrant.signed.operation.signature !== grant.signed.operation.signature) throw invalid();
	const owner = await db.prepare(`SELECT p.id AS party_id, c.*, w.owner_party_id, w.status AS wallet_status
		FROM account_initializations i JOIN user_identities u ON u.id = i.user_id
		JOIN parties p ON p.user_id = u.id AND p.kind = 'individual'
		LEFT JOIN account_identities c ON c.account_id = ? LEFT JOIN wallets w ON w.id = c.wallet_id
		WHERE i.id = ? AND u.firebase_project_id = ?`).bind(message.accountId, id, config.firebaseProjectId).first<Row>();
	if (!owner) throw invalid();
	const partyId = parseResourceId('party', owner.party_id);
	if (owner.id !== null && (owner.owner_party_id !== partyId || owner.wallet_status !== 'active'
		|| owner.canonical_address !== address || owner.initial_security_commitment !== message.initialSecurityCommitment
		|| owner.user_salt_commitment !== message.userSaltCommitment || owner.generation !== 3)) throw invalid();
	// A second chain reuses the cryptographic identity and wallet; it is NOT a new account owner.
	const walletId = owner.id === null ? createResourceId('wallet') : parseResourceId('wallet', owner.wallet_id);
	const identityId = owner.id === null ? createResourceId('accountIdentity') : parseResourceId('accountIdentity', owner.id);
	const accountId = createResourceId('walletAccount');
	const now = Math.floor(Date.now() / 1000), expires = security.security_expires_at;
	signal.throwIfAborted();
	if (now >= expires) throw new Error('SECURITY_FINALITY_UNUSABLE');
	const sourceJson = JSON.stringify(source.result), sourceDigest = deploymentDocumentDigest(sourceJson);
	const securityJson = JSON.stringify(security);
	if (securityJson.length > 16384) throw invalid();
	// One transaction, same predicates for every insert. Concurrent head changes or
	// another projector insert ZERO rows; uniqueness errors abort the entire batch.
	const from = `FROM account_initializations i JOIN user_identities u ON u.id = i.user_id
		JOIN parties p ON p.user_id = u.id AND p.kind = 'individual'
		JOIN account_creation_operations o ON o.initialization_id = i.id
		JOIN account_creation_observation_jobs j ON j.initialization_id = i.id
		JOIN account_creation_observations r ON r.initialization_id = i.id AND r.lease_epoch = j.latest_epoch
		WHERE i.id = ? AND u.firebase_project_id = ? AND p.id = ? AND o.user_op_hash = ? AND o.operation_signature = ?
		AND i.approval_digest = ? AND i.profile_sha256 = ? AND i.public_key = ? AND i.user_salt_commitment = ?
		AND o.operation_digest = ? AND j.latest_epoch = ? AND j.lease_token IS NULL AND r.result_json = ? AND r.result_sha256 = ?
		AND unixepoch() < ? AND NOT EXISTS (SELECT 1 FROM account_creation_projections x WHERE x.initialization_id = i.id)
		AND NOT EXISTS (SELECT 1 FROM account_identities c WHERE c.account_id = ? AND c.id <> ?)
		AND NOT EXISTS (SELECT 1 FROM wallets w WHERE w.id = ? AND (w.owner_party_id <> p.id OR w.status <> 'active'))`;
	const conditions = [id, config.firebaseProjectId, partyId, grant.signed.userOpHash, grant.signed.operation.signature,
		prepared.digest, prepared.profileDigest, prepared.policy.signers[0].key, message.userSaltCommitment, grant.signed.digest,
		source.epoch, sourceJson, sourceDigest, expires, message.accountId, identityId, walletId] as const;
	const writes = await db.batch([
		db.prepare(`INSERT INTO wallets(id,owner_party_id,controller,account_kind,status,created_at)
			SELECT ?,p.id,'end_user','evm_smart_account','active',? ${from} ON CONFLICT(id) DO NOTHING`).bind(walletId, now, ...conditions),
		db.prepare(`INSERT INTO account_identities(id,wallet_id,account_id,generation,initial_security_commitment,user_salt_commitment,canonical_address,created_at)
			SELECT ?,?,?,3,?,?,?,? ${from} ON CONFLICT(id) DO NOTHING`)
			.bind(identityId, walletId, message.accountId, message.initialSecurityCommitment, message.userSaltCommitment, address, now, ...conditions),
		db.prepare(`INSERT INTO account_instances(account_identity_id,network_id,address,generation,deployment_manifest_sha256,deployment_state,created_at)
			SELECT ?,?,?,3,?,'active',? ${from}`).bind(identityId, networkId, address, deploymentDigest, now, ...conditions),
		db.prepare(`INSERT INTO wallet_accounts(id,wallet_id,account_identity_id,network_id,created_at)
			SELECT ?,?,?,?,? ${from}`).bind(accountId, walletId, identityId, networkId, now, ...conditions),
		db.prepare(`INSERT INTO account_creation_projections(initialization_id,source_epoch,source_sha256,wallet_id,account_identity_id,
			wallet_account_id,security_json,security_sha256,projected_at,evidence_expires_at)
			SELECT i.id,?,?,?,?,?,?,?,?,? ${from}`).bind(source.epoch, sourceDigest, walletId, identityId, accountId,
				securityJson, deploymentDocumentDigest(securityJson), now, expires, ...conditions),
	]);
	if (writes.length !== 5 || writes.some((r) => !r.success || ![0, 1].includes(r.meta.changes))) throw invalid();
	if (writes[4].meta.changes === 1) return 'projected' as const;
	if (writes.some((r) => r.meta.changes !== 0)) throw invalid();
	return await existing() ? 'already_projected' as const : 'superseded' as const;
}
