import type { Environment } from '../../../../packages/environment';
import { CLIENT_RELEASE_HEADERS, WALLET_RELEASE_POLICY, type ReleasePolicy } from '../../../../shared/v3/clientRelease';
import { type CreationGasTerms } from '../../../../shared/v3/creationOperation';
import { parseCreationCapRequest } from '../../../../shared/v3/creationOperationWire';
import { loadPinnedCreationProfile } from '../../../../shared/v3/initialization';
import { parseInitializationProof } from '../../../../shared/v3/initializationWire';
import { parseResourceId } from '../../../../shared/v3/primitives';
import { readJsonBounded, ResponseBodyTooLargeError } from '../../services/http';
import { validateIdentityConfig, type AuthBindings } from '../auth/config';
import { IdentityError, verifyConsumerIdentity } from '../auth/identity';
import { requireCompatibleMutation } from '../clientCompatibility';
import { v3Json } from '../http';
import { InitializationError, InitializationRepository, type CreationProfilePin } from './initialization';
import { CreationOperationError, CreationOperationRepository } from './creationOperation';
import { WalletAccessError, WalletRepository } from './repository';

const PATH = /^\/app\/v1\/account-initializations\/([^/]+)\/creation-operation(\/authorize)?$(?![\s\S])/;
const headers = ['Authorization', 'Content-Type', ...Object.values(CLIENT_RELEASE_HEADERS)];
export const isCreationOperationPath = (path: string) => PATH.test(path);
type Initial = Awaited<ReturnType<InitializationRepository['readAuthorized']>>;
async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
		signal.addEventListener('abort', abort, { once: true });
		promise.then((value) => { signal.removeEventListener('abort', abort); resolve(value); },
			(error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
		if (signal.aborted) abort();
	});
}

/** Server-owned composition only. Quote providers must estimate the pinned creation
 * operation, never arbitrary user calldata. Production has no admitted provider or
 * profile. This API records an outbox; it neither sends inline nor asserts deployment.
 */
export function createCreationOperationRoute(dependencies: {
	readonly profiles: readonly (CreationProfilePin & { readonly environment: Environment['environment'] })[];
	readonly releasePolicy: ReleasePolicy;
	readonly requireFreshDeployment: (pin: CreationProfilePin, signal: AbortSignal) => Promise<void>;
	readonly quoteGas: (pin: CreationProfilePin, initial: Initial, cap: bigint, signal: AbortSignal) => Promise<CreationGasTerms>;
}) {
	const policy = structuredClone(dependencies.releasePolicy);
	const profiles = dependencies.profiles.map((p) => Object.freeze({ pin: Object.freeze({ document: p.document, digest: p.digest }),
		environment: p.environment, deployment: loadPinnedCreationProfile(p.document, p.digest).deployment }));
	if (profiles.length > 32 || new Set(profiles.map((p) => `${p.environment}:${p.pin.digest}`)).size !== profiles.length) throw new Error('Invalid creation catalog');
	const observe = dependencies.requireFreshDeployment, quote = dependencies.quoteGas;
	return async function route(request: Request, env: AuthBindings, manifest: Environment): Promise<Response> {
		let config: Environment;
		try { config = validateIdentityConfig(env, manifest); }
		catch { return v3Json(503, { error_code: 'SERVICE_UNAVAILABLE' }); }
		const url = new URL(request.url), origin = request.headers.get('Origin');
		if (url.origin !== config.api_origin || origin !== config.web_origin || !config.webauthn_allowed_origins.includes(origin)) return v3Json(403, { error_code: 'ORIGIN_NOT_ALLOWED' });
		const respond = (status: number, body: object) => v3Json(status, body, origin);
		const match = PATH.exec(url.pathname);
		if (!match || url.search) return respond(404, { error_code: 'NOT_FOUND' });
		let id; try { id = parseResourceId('operation', match[1]); } catch { return respond(404, { error_code: 'NOT_FOUND' }); }
		const methods = match[2] ? ['POST'] : ['GET', 'POST'];
		if (request.method === 'OPTIONS') {
			const requested = (request.headers.get('Access-Control-Request-Headers') ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
			if (!methods.includes(request.headers.get('Access-Control-Request-Method') ?? '') || requested.some((h) => !headers.some((allowed) => allowed.toLowerCase() === h))) return respond(403, { error_code: 'CORS_NOT_ALLOWED' });
			const response = respond(200, {}); response.headers.set('Access-Control-Allow-Methods', methods.join(', '));
			response.headers.set('Access-Control-Allow-Headers', headers.join(', '));
			response.headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'); return response;
		}
		if (!methods.includes(request.method)) {
			const response = respond(405, { error_code: 'METHOD_NOT_ALLOWED' }); response.headers.set('Allow', [...methods, 'OPTIONS'].join(', ')); return response;
		}
		const reading = request.method === 'GET';
		const incompatible = requireCompatibleMutation(request, config, reading ? 'identity' : 'account', policy);
		if (incompatible) return incompatible;
		if (!reading && !/^application\/json(?:\s*;\s*charset=utf-8)?$(?![\s\S])/i.test(request.headers.get('Content-Type') ?? '')) return respond(400, { error_code: 'INVALID_CREATION_REQUEST' });
		const available = profiles.filter((p) => p.environment === config.environment && (reading ||
			(config.wallet_enabled.includes(p.deployment.network_id) && request.headers.get(CLIENT_RELEASE_HEADERS.generation) === String(p.deployment.generation)
				&& request.headers.get(CLIENT_RELEASE_HEADERS.manifest) === p.deployment.manifest_id)));
		if (!reading && !available.length) return respond(503, { error_code: 'PROFILE_UNAVAILABLE' });
		const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
		try {
			const principal = await verifyConsumerIdentity(request, env.FIREBASE_PROJECT_ID);
			await new WalletRepository(env.WALLET_DB, principal).getSession(); signal.throwIfAborted();
			const scope = { rpId: config.webauthn_rp_id, origin }, pins = available.map((p) => p.pin);
			const repo = new CreationOperationRepository(env.WALLET_DB, principal, scope, pins);
			if (reading) { const result = await repo.preview(id); signal.throwIfAborted(); return respond(200, result); }
			let body: unknown;
			try { body = await readJsonBounded<unknown>(new Response(request.body, { headers: request.headers }), 8192,
				AbortSignal.any([signal, AbortSignal.timeout(5000)])); }
			catch (error) { return respond(error instanceof ResponseBodyTooLargeError ? 413 : 400, { error_code: 'INVALID_CREATION_REQUEST' }); }
			let cap: bigint | undefined, proof;
			try { if (match[2]) proof = parseInitializationProof(body); else cap = parseCreationCapRequest(body); }
			catch { return respond(400, { error_code: 'INVALID_CREATION_REQUEST' }); }
			const initial = await new InitializationRepository(env.WALLET_DB, principal, scope, pins).readAuthorized(id);
			const profile = available.find((p) => p.pin.digest === initial.input.expectedDigest);
			if (!profile) throw new InitializationError('PROFILE_UNAVAILABLE');
			let existing;
			try { existing = await repo.read(id); }
			catch (error) { if (!(error instanceof WalletAccessError) || error.code !== 'NOT_FOUND') throw error; }
			signal.throwIfAborted();
			if (!match[2]) {
				if (existing) {
					// A lost response cannot silently obtain another price or signing digest.
					if (existing.terms.maximumGasCharge !== cap) throw new CreationOperationError('CREATION_CONFLICT');
				} else {
					if (Math.floor(Date.now() / 1000) >= initial.input.validUntil) throw new CreationOperationError('CREATION_EXPIRED');
					await bounded(observe(profile.pin, signal), signal); signal.throwIfAborted();
					const terms = await bounded(quote(profile.pin, initial, cap!, signal), signal); signal.throwIfAborted();
					if (terms.maximumGasCharge !== cap) throw new Error('Quote changed approved cap');
					if ([terms.verificationGasLimit, terms.callGasLimit, terms.preVerificationGas, terms.maxFeePerGas]
						.every((value) => typeof value === 'bigint' && value > 0n && value < (1n << 120n))
						&& (terms.verificationGasLimit + terms.callGasLimit + terms.preVerificationGas) * terms.maxFeePerGas > cap!) {
						// A small user cap is not provider downtime and is never raised silently.
						return respond(422, { error_code: 'CREATION_CAP_TOO_LOW' });
					}
					await repo.prepare(id, terms);
				}
				const result = await repo.preview(id); signal.throwIfAborted(); return respond(200, result);
			}
			if (!existing) throw new WalletAccessError('NOT_FOUND');
			if (existing.state !== 'authorized') {
				if (existing.authorization_expired) throw new CreationOperationError('CREATION_EXPIRED');
				await bounded(observe(profile.pin, signal), signal); signal.throwIfAborted();
			}
			// Exact signed retries are readbacks; repository still verifies both proofs and
			// compares the winning signature. No fresh RPC or second outbox is needed.
			const result = await repo.authorize(id, proof!); signal.throwIfAborted(); return respond(200, result);
		} catch (error) {
			if (error instanceof CreationOperationError) return respond({ CREATION_EXPIRED: 410, CREATION_CONFLICT: 409, INVALID_CREATION_ASSERTION: 400 }[error.code], { error_code: error.code });
			if (error instanceof InitializationError) return respond({ PROFILE_UNAVAILABLE: 503, INITIALIZATION_EXPIRED: 410,
				INITIALIZATION_CONFLICT: 409, INITIALIZATION_LIMIT: 429, INITIALIZATION_REQUIRED: 409, INVALID_INITIALIZATION_ASSERTION: 400 }[error.code], { error_code: error.code });
			if (error instanceof IdentityError) return respond(error.code === 'UNAUTHENTICATED' ? 401 : 503, { error_code: error.code });
			if (error instanceof WalletAccessError) return respond({ UNAUTHENTICATED: 401, SESSION_REQUIRED: 409, NOT_FOUND: 404, WALLET_DATA_INVALID: 503 }[error.code], { error_code: error.code });
			return respond(503, { error_code: 'CREATION_UNAVAILABLE' });
		}
	};
}

export const creationOperationRoute = createCreationOperationRoute({ profiles: [], releasePolicy: WALLET_RELEASE_POLICY,
	async requireFreshDeployment() { throw new Error('No admitted V3 deployment observer'); },
	async quoteGas() { throw new Error('No admitted creation gas provider'); },
});
