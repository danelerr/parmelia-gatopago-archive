import type { Environment } from '../../../../packages/environment';
import { CLIENT_RELEASE_HEADERS, WALLET_RELEASE_POLICY, type ReleasePolicy } from '../../../../shared/v3/clientRelease';
import { loadPinnedCreationProfile } from '../../../../shared/v3/initialization';
import { parseInitializationCursor, parseInitializationProof, parseInitializationRequest } from '../../../../shared/v3/initializationWire';
import { parseResourceId } from '../../../../shared/v3/primitives';
import { readJsonBounded, ResponseBodyTooLargeError } from '../../services/http';
import { validateIdentityConfig, type AuthBindings } from '../auth/config';
import { IdentityError, verifyConsumerIdentity } from '../auth/identity';
import { requireCompatibleMutation } from '../clientCompatibility';
import { v3Json } from '../http';
import { InitializationError, InitializationRepository, type CreationProfilePin } from './initialization';
import { WalletAccessError, WalletRepository } from './repository';

const ROOT = '/app/v1/account-initializations';
const headers = ['Authorization', 'Content-Type', ...Object.values(CLIENT_RELEASE_HEADERS)];
export function isInitializationPath(path: string) {
	return path === ROOT || /^\/app\/v1\/account-initializations\/[^/]+(?:\/authorize)?$(?![\s\S])/.test(path);
}

/** Constructed by the server composition root, never by HTTP/config supplied by a user.
 * Profile integrity is NOT admission. Populating this configuration requires independent
 * release/network admission AND a fresh original-composition observer. The deployed
 * entrypoint below has neither and remains closed, including with forged version headers.
 */
export function createInitializationRoute(dependencies: {
	readonly profiles: readonly (CreationProfilePin & { readonly environment: Environment['environment'] })[];
	readonly releasePolicy: ReleasePolicy;
	readonly requireFreshDeployment: (profile: CreationProfilePin, signal: AbortSignal) => Promise<void>;
}) {
	const policy = structuredClone(dependencies.releasePolicy);
	const profiles = dependencies.profiles.map((p) => {
		const pin = Object.freeze({ document: p.document, digest: p.digest });
		return Object.freeze({ pin, environment: p.environment, deployment: loadPinnedCreationProfile(pin.document, pin.digest).deployment });
	});
	if (profiles.length > 32 || new Set(profiles.map((p) => `${p.environment}:${p.pin.digest}`)).size !== profiles.length) throw new Error('Invalid creation catalog');
	const observe = dependencies.requireFreshDeployment;
	return async function initializationRoute(request: Request, env: AuthBindings, manifest: Environment): Promise<Response> {
		let config: Environment;
		try { config = validateIdentityConfig(env, manifest); }
		catch { return v3Json(503, { error_code: 'SERVICE_UNAVAILABLE' }); }
		const url = new URL(request.url), origin = request.headers.get('Origin');
		if (url.origin !== config.api_origin || origin !== config.web_origin || !config.webauthn_allowed_origins.includes(origin)) return v3Json(403, { error_code: 'ORIGIN_NOT_ALLOWED' });
		const respond = (status: number, body: object) => v3Json(status, body, origin);
		if (!isInitializationPath(url.pathname)) return respond(404, { error_code: 'NOT_FOUND' });
		const methods = url.pathname === ROOT ? ['GET', 'POST'] : url.pathname.endsWith('/authorize') ? ['POST'] : ['GET'];
		let after: string | undefined;
		if (url.search) {
			const queryRead = request.method === 'GET' || (request.method === 'OPTIONS' && request.headers.get('Access-Control-Request-Method') === 'GET');
			if (!queryRead || url.pathname !== ROOT || url.search.length > 128 ||
				[...url.searchParams.keys()].some((key) => key !== 'after') || url.searchParams.getAll('after').length !== 1) return respond(404, { error_code: 'NOT_FOUND' });
			after = url.searchParams.get('after') ?? undefined;
			try { parseInitializationCursor(after); } catch { return respond(400, { error_code: 'INVALID_CURSOR' }); }
		}
		if (request.method === 'OPTIONS') {
			const requested = (request.headers.get('Access-Control-Request-Headers') ?? '').toLowerCase().split(',').map((p) => p.trim()).filter(Boolean);
			if (!methods.includes(request.headers.get('Access-Control-Request-Method') ?? '')
				|| requested.some((h) => !headers.some((allowed) => allowed.toLowerCase() === h))) return respond(403, { error_code: 'CORS_NOT_ALLOWED' });
			const response = respond(200, {});
			response.headers.set('Access-Control-Allow-Methods', methods.join(', ')); response.headers.set('Access-Control-Allow-Headers', headers.join(', '));
			response.headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'); return response;
		}
		if (!methods.includes(request.method)) {
			const response = respond(405, { error_code: 'METHOD_NOT_ALLOWED' }); response.headers.set('Allow', [...methods, 'OPTIONS'].join(', ')); return response;
		}
		const reading = request.method === 'GET';
		const incompatible = requireCompatibleMutation(request, config, reading ? 'identity' : 'account', policy);
		if (incompatible) return incompatible;
		if (!reading && !/^application\/json(?:\s*;\s*charset=utf-8)?$(?![\s\S])/i.test(request.headers.get('Content-Type') ?? '')) return respond(400, { error_code: 'INVALID_INITIALIZATION' });
		const available = profiles.filter((p) => p.environment === config.environment && config.wallet_enabled.includes(p.deployment.network_id)
			&& request.headers.get(CLIENT_RELEASE_HEADERS.generation) === String(p.deployment.generation)
			&& request.headers.get(CLIENT_RELEASE_HEADERS.manifest) === p.deployment.manifest_id);
		if (!reading && !available.length) return respond(503, { error_code: 'PROFILE_UNAVAILABLE' });
		try {
			const principal = await verifyConsumerIdentity(request, env.FIREBASE_PROJECT_ID);
			// No unauthenticated deployment probes or identity auto-creation.
			await new WalletRepository(env.WALLET_DB, principal).getSession();
			if (reading) {
				// Historical reads neither depend on fresh RPC nor authorize new work.
				// A removed profile can be listed but cannot supply signing metadata.
				const readProfiles = profiles.filter((p) => p.environment === config.environment).map((p) => p.pin);
				const repo = new InitializationRepository(env.WALLET_DB, principal, { rpId: config.webauthn_rp_id, origin }, readProfiles);
				let result;
				if (url.pathname === ROOT) result = await repo.history(after);
				else {
					let id; try { id = parseResourceId('operation', url.pathname.split('/')[4]); }
					catch { return respond(404, { error_code: 'NOT_FOUND' }); }
					result = await repo.restore(id);
				}
				request.signal.throwIfAborted(); return respond(200, result);
			}
			let body: unknown;
			try { body = await readJsonBounded<unknown>(new Response(request.body, { headers: request.headers }), 8192,
				AbortSignal.any([request.signal, AbortSignal.timeout(5000)])); }
			catch (error) { return respond(error instanceof ResponseBodyTooLargeError ? 413 : 400, { error_code: 'INVALID_INITIALIZATION' }); }
			request.signal.throwIfAborted();
			const repo = new InitializationRepository(env.WALLET_DB, principal, { rpId: config.webauthn_rp_id, origin }, available.map((p) => p.pin));
			if (url.pathname === ROOT) {
				let input;
				try { input = parseInitializationRequest(body); }
				catch { return respond(400, { error_code: 'INVALID_INITIALIZATION' }); }
				const profile = available.find((p) => p.pin.digest === input.profileDigest);
				if (!profile) throw new InitializationError('PROFILE_UNAVAILABLE');
				await observe(profile.pin, request.signal); request.signal.throwIfAborted();
				await repo.prepare(input);
				const result = await repo.readPreparation(input.id); request.signal.throwIfAborted();
				return respond(200, result);
			}
			let id, proof;
			try { id = parseResourceId('operation', url.pathname.split('/')[4]); proof = parseInitializationProof(body); }
			catch { return respond(400, { error_code: 'INVALID_INITIALIZATION' }); }
			const prepared = await repo.readPreparation(id);
			const profile = available.find((p) => p.pin.digest === prepared.profile_sha256);
			if (!profile) throw new InitializationError('PROFILE_UNAVAILABLE');
			await observe(profile.pin, request.signal); request.signal.throwIfAborted();
			const result = await repo.authorize(id, proof); request.signal.throwIfAborted();
			return respond(200, result);
		} catch (error) {
			if (error instanceof InitializationError) return respond({ PROFILE_UNAVAILABLE: 503, INITIALIZATION_EXPIRED: 410,
				INITIALIZATION_CONFLICT: 409, INITIALIZATION_LIMIT: 429, INITIALIZATION_REQUIRED: 409, INVALID_INITIALIZATION_ASSERTION: 400 }[error.code], { error_code: error.code });
			if (error instanceof IdentityError) return respond(error.code === 'UNAUTHENTICATED' ? 401 : 503, { error_code: error.code });
			if (error instanceof WalletAccessError) return respond({ UNAUTHENTICATED: 401, SESSION_REQUIRED: 409, NOT_FOUND: 404, WALLET_DATA_INVALID: 503 }[error.code], { error_code: error.code });
			// Crypto or infrastructure detail is not returned to the caller. A retry cannot
			// turn an unknown outcome into a new authorization or an executed account.
			return respond(503, { error_code: 'INITIALIZATION_UNAVAILABLE' });
		}
	};
}

export const initializationRoute = createInitializationRoute({ profiles: [], releasePolicy: WALLET_RELEASE_POLICY,
	async requireFreshDeployment() { throw new Error('No independently admitted V3 deployment observer'); },
});
