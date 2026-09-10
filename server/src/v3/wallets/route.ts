import type { Environment } from '../../../../packages/environment';
import { parseResourceId, type ResourceKind } from '../../../../shared/v3/primitives';
import { CLIENT_RELEASE_HEADERS } from '../../../../shared/v3/clientRelease';
import { readJsonBounded, ResponseBodyTooLargeError } from '../../services/http';
import { validateIdentityConfig, type AuthBindings } from '../auth/config';
import { IdentityError, verifyConsumerIdentity } from '../auth/identity';
import { requireCompatibleMutation } from '../clientCompatibility';
import { v3Json as json } from '../http';
import { WalletAccessError, WalletRepository } from './repository';
import { inspectOwnedWalletBalances, type BalanceProfile } from './balances';
import { readOwnedTransferStatus } from './transferStatus';
import { readOwnedAccountContext } from './accountContext';

const SESSION_PATH = '/app/v1/session';
const WALLETS_PATH = '/app/v1/wallets';
const BALANCES_PATH = /^\/app\/v1\/wallets\/[^/]+\/accounts\/[^/]+\/balances$(?![\s\S])/;
const CONTEXT_PATH = /^\/app\/v1\/wallets\/[^/]+\/accounts\/[^/]+\/context$(?![\s\S])/;
const TRANSFER_PATH = /^\/app\/v1\/wallets\/[^/]+\/accounts\/[^/]+\/transfers\/[^/]+$(?![\s\S])/;
const allowedHeaders = ['Authorization', 'Content-Type', ...Object.values(CLIENT_RELEASE_HEADERS)];

export function isWalletReadPath(path: string): boolean {
	return path === SESSION_PATH || path === WALLETS_PATH || /^\/app\/v1\/wallets\/[^/]+\/accounts$(?![\s\S])/.test(path) || BALANCES_PATH.test(path) || TRANSFER_PATH.test(path) || CONTEXT_PATH.test(path);
}

function page(search: URLSearchParams, kind: ResourceKind) {
	if ([...search.keys()].some((key) => !['limit', 'after'].includes(key)) || search.getAll('limit').length > 1 || search.getAll('after').length > 1) {
		throw new Error('Invalid pagination');
	}
	const limit = search.get('limit') ?? '20';
	if (!/^(?:[1-9]|[1-4][0-9]|50)$(?![\s\S])/.test(limit)) throw new Error('Invalid page size');
	return { limit: Number(limit), after: search.has('after') ? parseResourceId(kind, search.get('after')) : '' };
}

/** Consumer identity/read boundary, not a signing or wallet-enrollment endpoint.
 * Configuration comes from the versioned environment, never request JSON/headers.
 */
export async function walletReadRoute(request: Request, env: AuthBindings, manifest: Environment,
	// Server admission only. Default remains empty; no request field can enable a profile.
	balanceProfiles: readonly BalanceProfile[] = []): Promise<Response> {
	let config: Environment;
	try { config = validateIdentityConfig(env, manifest); }
	catch { return json(503, { error_code: 'SERVICE_UNAVAILABLE' }); }
	const url = new URL(request.url);
	const origin = request.headers.get('Origin');
	if (url.origin !== config.api_origin || origin !== config.web_origin) return json(403, { error_code: 'ORIGIN_NOT_ALLOWED' });
	const respond = (status: number, body: object) => json(status, body, config.web_origin);
	if (!isWalletReadPath(url.pathname)) return respond(404, { error_code: 'NOT_FOUND' });
	const isSession = url.pathname === SESSION_PATH;
	const isWallets = url.pathname === WALLETS_PATH;
	const isBalances = BALANCES_PATH.test(url.pathname);
	const isTransfer = TRANSFER_PATH.test(url.pathname);
	const isContext = CONTEXT_PATH.test(url.pathname);
	let pagination: ReturnType<typeof page> = { limit: 20, after: '' };
	let walletId: ReturnType<typeof parseResourceId<'wallet'>> | undefined;
	let accountId: ReturnType<typeof parseResourceId<'walletAccount'>> | undefined;
	let operationId: ReturnType<typeof parseResourceId<'operation'>> | undefined;
	try {
		if (isSession) { if (url.search) throw new Error('No session query'); }
		else if (isBalances || isTransfer || isContext) {
			if (url.search) throw new Error('No balance overrides');
			walletId = parseResourceId('wallet', url.pathname.split('/')[4]);
			accountId = parseResourceId('walletAccount', url.pathname.split('/')[6]);
			if (isTransfer) operationId = parseResourceId('operation', url.pathname.split('/')[8]);
		} else {
			pagination = page(url.searchParams, isWallets ? 'wallet' : 'walletAccount');
			if (!isWallets) walletId = parseResourceId('wallet', url.pathname.split('/')[4]);
		}
	} catch { return respond(400, { error_code: 'INVALID_REQUEST' }); }
	const methods = isSession ? ['GET', 'POST'] : ['GET'];
	if (request.method === 'OPTIONS') {
		const headers = (request.headers.get('Access-Control-Request-Headers') ?? '').toLowerCase().split(',').map((value) => value.trim()).filter(Boolean);
		if (!methods.includes(request.headers.get('Access-Control-Request-Method') ?? '')
			|| headers.some((name) => !allowedHeaders.some((allowed) => name === allowed.toLowerCase()))) return respond(403, { error_code: 'CORS_NOT_ALLOWED' });
		const response = respond(200, {});
		response.headers.set('Access-Control-Allow-Methods', methods.join(', '));
		response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
		response.headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
		return response;
	}
	if (!methods.includes(request.method)) {
		const response = respond(405, { error_code: 'METHOD_NOT_ALLOWED' });
		response.headers.set('Allow', [...methods, 'OPTIONS'].join(', '));
		return response;
	}
	if (request.method === 'POST') {
		const incompatible = requireCompatibleMutation(request, config, 'identity');
		if (incompatible) return incompatible;
		if (!/^application\/json(?:\s*;\s*charset=utf-8)?$(?![\s\S])/i.test(request.headers.get('Content-Type') ?? '')) return respond(400, { error_code: 'INVALID_REQUEST' });
		try {
			const body = await readJsonBounded<unknown>(new Response(request.body, { headers: request.headers }), 1024,
				AbortSignal.any([request.signal, AbortSignal.timeout(5000)]));
			if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) throw new Error('Expected empty object');
		} catch (error) { return respond(error instanceof ResponseBodyTooLargeError ? 413 : 400, { error_code: 'INVALID_REQUEST' }); }
	}
	try {
		const principal = await verifyConsumerIdentity(request, env.FIREBASE_PROJECT_ID);
		request.signal.throwIfAborted();
		const repository = new WalletRepository(env.WALLET_DB, principal);
		if (isSession) return respond(200, request.method === 'POST' ? await repository.ensureSession() : await repository.getSession());
		if (isTransfer) return respond(200, await readOwnedTransferStatus(env.WALLET_DB, principal, walletId!, accountId!, operationId!));
		if (isContext) return respond(200, await readOwnedAccountContext(repository, walletId!, accountId!, balanceProfiles, request.signal));
		if (isBalances) return respond(200, await inspectOwnedWalletBalances(repository, walletId!, accountId!, balanceProfiles, request.signal));
		return respond(200, isWallets ? await repository.listWallets(pagination) : await repository.listAccounts(walletId!, pagination));
	} catch (error) {
		if (error instanceof IdentityError) return respond(error.code === 'UNAUTHENTICATED' ? 401 : 503, { error_code: error.code });
		if (error instanceof WalletAccessError) {
			const status = { UNAUTHENTICATED: 401, SESSION_REQUIRED: 409, NOT_FOUND: 404, WALLET_DATA_INVALID: 503 }[error.code];
			return respond(status, { error_code: error.code });
		}
		// Do not expose token, Firebase claims, SQL errors, commitments or provider diagnostics.
		return respond(503, { error_code: 'SERVICE_UNAVAILABLE' });
	}
}
