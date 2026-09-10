import type { Environment } from '../../../../packages/environment';
import { CLIENT_RELEASE_HEADERS, WALLET_RELEASE_POLICY, type ReleasePolicy } from '../../../../shared/v3/clientRelease';
import { deploymentDocumentDigest } from '../../../../shared/v3/deployment';
import { loadPinnedCreationProfile } from '../../../../shared/v3/initialization';
import { parseInitializationProof } from '../../../../shared/v3/initializationWire';
import { parseResourceId } from '../../../../shared/v3/primitives';
import { readJsonBounded, ResponseBodyTooLargeError } from '../../services/http';
import { validateIdentityConfig, type AuthBindings } from '../auth/config';
import { IdentityError, verifyConsumerIdentity } from '../auth/identity';
import { requireCompatibleMutation } from '../clientCompatibility';
import { v3Json } from '../http';
import { ActivationError, ActivationRepository, type ActivationProfiles } from './activation';
import { ActivationStatusRepository } from './activationStatus';
import { parseActivationAuthorization, parseActivationCommitRequest, parseActivationRequest } from './activationWire';
import { InitializationError, type CreationProfilePin } from './initialization';
import { WalletAccessError, WalletRepository } from './repository';

const ROOT = '/app/v1/account-activations';
const PATH = /^\/app\/v1\/account-activations(?:\/([^/]+)(?:(\/authorize)|\/commits(?:\/([^/]+)(\/authorize)?)?)?)?$(?![\s\S])/;
const STATUS_PATH = /^\/app\/v1\/account-activations\/([^/]+)(?:\/commits\/([^/]+))?\/status$(?![\s\S])/;
const allowedHeaders = ['Authorization', 'Content-Type', ...Object.values(CLIENT_RELEASE_HEADERS)];
export const isActivationPath = (path: string) => PATH.test(path) || STATUS_PATH.test(path);

async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
 return new Promise((resolve, reject) => {
  const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
  signal.addEventListener('abort', abort, { once: true });
  promise.then((value) => { signal.removeEventListener('abort', abort); resolve(value); },
   (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
  if (signal.aborted) abort();
 });
}

/** Authenticated consumer transport for two separate consents. Reads and exact retries
 * do not observe RPC, renew terms, wake jobs or broadcast. Authorization is not execution.
 * Profiles/resolver are server composition, never HTTP input. No real network admitted. */
export function createActivationRoute(dependencies: {
 readonly profiles: readonly (CreationProfilePin & { readonly environment: Environment['environment'] })[];
 readonly releasePolicy: ReleasePolicy;
 readonly resolveProfiles: ActivationProfiles;
}) {
 const policy = structuredClone(dependencies.releasePolicy), resolve = dependencies.resolveProfiles;
 const profiles = dependencies.profiles.map((p) => {
  const deployment = loadPinnedCreationProfile(p.document, p.digest).deployment;
  return Object.freeze({ pin: Object.freeze({ document: p.document, digest: p.digest }), environment: p.environment,
   deployment, deploymentDigest: deploymentDocumentDigest(JSON.stringify(deployment)) });
 });
 if (profiles.length > 32 || new Set(profiles.map((p) => `${p.environment}:${p.pin.digest}`)).size !== profiles.length) throw new Error('Invalid activation catalog');
 return async function route(request: Request, env: AuthBindings, manifest: Environment): Promise<Response> {
  let config: Environment;
  try { config = validateIdentityConfig(env, manifest); }
  catch { return v3Json(503, { error_code: 'SERVICE_UNAVAILABLE' }); }
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (url.origin !== config.api_origin || origin !== config.web_origin || !config.webauthn_allowed_origins.includes(origin)) return v3Json(403, { error_code: 'ORIGIN_NOT_ALLOWED' });
  const respond = (status: number, body: object) => v3Json(status, body, origin);
  const statusMatch = STATUS_PATH.exec(url.pathname), match = PATH.exec(url.pathname);
  if ((!match && !statusMatch) || url.search) return respond(404, { error_code: 'NOT_FOUND' });
  let activationId, commitId;
  try {
   const parent = statusMatch?.[1] ?? match?.[1], child = statusMatch?.[2] ?? match?.[3];
   if (parent) activationId = parseResourceId('operation', parent); if (child) commitId = parseResourceId('operation', child);
  }
  catch { return respond(404, { error_code: 'NOT_FOUND' }); }
  const create = url.pathname === ROOT, commits = url.pathname.endsWith('/commits'), authorize = !!(match?.[2] || match?.[4]);
  const methods = create || commits || authorize ? ['POST'] : ['GET'];
  if (request.method === 'OPTIONS') {
   const requested = (request.headers.get('Access-Control-Request-Headers') ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
   if (!methods.includes(request.headers.get('Access-Control-Request-Method') ?? '') || requested.some((h) => !allowedHeaders.some((allowed) => allowed.toLowerCase() === h))) return respond(403, { error_code: 'CORS_NOT_ALLOWED' });
   const response = respond(200, {}); response.headers.set('Access-Control-Allow-Methods', methods.join(', '));
   response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
   response.headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'); return response;
  }
  if (!methods.includes(request.method)) {
   const response = respond(405, { error_code: 'METHOD_NOT_ALLOWED' }); response.headers.set('Allow', [...methods, 'OPTIONS'].join(', ')); return response;
  }
  const reading = request.method === 'GET';
  const incompatible = requireCompatibleMutation(request, config, reading ? 'identity' : 'account', policy);
  if (incompatible) return incompatible;
  if (!reading && !/^application\/json(?:\s*;\s*charset=utf-8)?$(?![\s\S])/i.test(request.headers.get('Content-Type') ?? '')) return respond(400, { error_code: 'INVALID_ACTIVATION_REQUEST' });
  const available = profiles.filter((p) => p.environment === config.environment && (reading ||
   (config.wallet_enabled.includes(p.deployment.network_id) && request.headers.get(CLIENT_RELEASE_HEADERS.generation) === String(p.deployment.generation)
    && request.headers.get(CLIENT_RELEASE_HEADERS.manifest) === p.deployment.manifest_id)));
  if (!reading && !available.length) return respond(503, { error_code: 'ACTIVATION_PROFILE_UNAVAILABLE' });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
  try {
   signal.throwIfAborted();
   const principal = await verifyConsumerIdentity(request, env.FIREBASE_PROJECT_ID);
   await new WalletRepository(env.WALLET_DB, principal).getSession(); signal.throwIfAborted();
   if (statusMatch) {
    const result = await new ActivationStatusRepository(env.WALLET_DB, principal, { rpId: config.webauthn_rp_id, origin },
     available.map((p) => p.pin)).read(activationId!, commitId);
    signal.throwIfAborted(); return respond(200, result);
   }
   const resolver: ActivationProfiles = async (owned, childSignal) => {
    const matching = available.filter((p) => p.deployment.network_id === owned.network_id && p.deploymentDigest === owned.deployment_manifest_sha256);
    if (matching.length !== 1) throw new ActivationError('ACTIVATION_PROFILE_UNAVAILABLE');
    const result = structuredClone(await bounded(resolve(structuredClone(owned), childSignal), childSignal));
    childSignal.throwIfAborted();
    if (result.length !== 1 || result[0].digest !== matching[0].deploymentDigest) throw new ActivationError('ACTIVATION_PROFILE_UNAVAILABLE');
    return result;
   };
   const repo = new ActivationRepository(env.WALLET_DB, principal, { rpId: config.webauthn_rp_id, origin }, available.map((p) => p.pin), resolver);
   // A nested commit must belong to the path's activation, even when the same user
   // owns both. Check before allowing any mutation; missing/wrong parent is a 404.
   if (commitId) {
    const record = await repo.readCommit(commitId); signal.throwIfAborted();
    if (record.activation_id !== activationId) throw new WalletAccessError('NOT_FOUND');
    if (reading) return respond(200, record);
   } else if (reading) {
    const record = await repo.read(activationId!); signal.throwIfAborted(); return respond(200, record);
   }
   let body: unknown;
   try { body = await readJsonBounded<unknown>(new Response(request.body, { headers: request.headers }), authorize ? 98_304 : 16_384,
    AbortSignal.any([signal, AbortSignal.timeout(5000)])); }
   catch (error) { return respond(error instanceof ResponseBodyTooLargeError ? 413 : 400, { error_code: 'INVALID_ACTIVATION_REQUEST' }); }
   // Parse every command before the repository may inspect a network or persist it.
   let command;
   try {
    if (create) command = { kind: 'prepare' as const, value: parseActivationRequest(body) };
    else if (commits) command = { kind: 'commit' as const, value: parseActivationCommitRequest(body) };
    else if (commitId) command = { kind: 'commit_authorize' as const, value: parseInitializationProof(body) };
    else command = { kind: 'authorize' as const, value: parseActivationAuthorization(body) };
   } catch { return respond(400, { error_code: 'INVALID_ACTIVATION_REQUEST' }); }
   signal.throwIfAborted();
   const result = command.kind === 'prepare' ? await repo.prepare(command.value, signal)
    : command.kind === 'commit' ? await repo.prepareCommit(command.value, activationId!, signal)
     : command.kind === 'commit_authorize' ? await repo.authorizeCommit(commitId!, command.value, signal)
      : await repo.authorize(activationId!, command.value.owner, command.value.enrollments, signal);
   signal.throwIfAborted(); return respond(200, result);
  } catch (error) {
   if (error instanceof ActivationError) return respond({ ACTIVATION_EXPIRED: 410, ACTIVATION_CONFLICT: 409, ACTIVATION_LIMIT: 429,
    ACTIVATION_PROFILE_UNAVAILABLE: 503, ACTIVATION_STATE_CHANGED: 409, ACTIVATION_REQUIRED: 409, INVALID_ACTIVATION_PROOF: 400 }[error.code], { error_code: error.code });
   if (error instanceof InitializationError) return respond({ PROFILE_UNAVAILABLE: 503, INITIALIZATION_EXPIRED: 410,
    INITIALIZATION_CONFLICT: 409, INITIALIZATION_LIMIT: 429, INITIALIZATION_REQUIRED: 409, INVALID_INITIALIZATION_ASSERTION: 400 }[error.code], { error_code: error.code });
   if (error instanceof IdentityError) return respond(error.code === 'UNAUTHENTICATED' ? 401 : 503, { error_code: error.code });
   if (error instanceof WalletAccessError) return respond({ UNAUTHENTICATED: 401, SESSION_REQUIRED: 409, NOT_FOUND: 404, WALLET_DATA_INVALID: 503 }[error.code], { error_code: error.code });
   // Public compiler codes are an explicit allowlist; never return raw RPC/D1 errors.
   if (error instanceof Error && ['ACTIVATION_PROPOSAL_WINDOW_INVALID', 'ACTIVATION_MUST_RETAIN_INITIAL_FACTOR',
    'ACTIVATION_SIGNER_TRANSPORT_UNSUPPORTED', 'ACTIVATION_VERIFIER_MISMATCH'].includes(error.message)) return respond(400, { error_code: error.message });
   if (error instanceof Error && ['ACTIVATION_STATE_MISMATCH', 'ACTIVATION_PROPOSAL_PENDING', 'ACTIVATION_PENDING_MISMATCH',
    'ACTIVATION_NONCE_EXHAUSTED'].includes(error.message)) return respond(409, { error_code: error.message });
   return respond(503, { error_code: 'ACTIVATION_UNAVAILABLE' });
  }
 };
}

export const activationRoute = createActivationRoute({ profiles: [], releasePolicy: WALLET_RELEASE_POLICY,
 async resolveProfiles() { throw new ActivationError('ACTIVATION_PROFILE_UNAVAILABLE'); },
});
