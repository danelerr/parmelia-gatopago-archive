import { isIP } from 'node:net';
import type { Environment } from '../../../../packages/environment';
import { readJsonBounded, ResponseBodyTooLargeError } from '../../services/http';
import { validateAuthConfig, type AuthBindings } from './config';
import { consumeLimit, privateLimitKey, pruneLimits } from './limits';
import { sendSignInLink, verifyHuman } from './providers';
import { CLIENT_RELEASE_HEADERS } from '../../../../shared/v3/clientRelease';
import { requireCompatibleMutation } from '../clientCompatibility';
import { v3Json as json } from '../http';

export const EMAIL_LINK_PATH = '/app/v1/auth/email-link/request';

const allowedHeaders = ['Content-Type', ...Object.values(CLIENT_RELEASE_HEADERS)];

function inputBody(value: unknown): { email: string; token: string; locale: 'es' | 'en' } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['email', 'turnstileToken', 'locale'].includes(key)) ||
      typeof body.email !== 'string' || typeof body.turnstileToken !== 'string' ||
      body.turnstileToken.length === 0 || body.turnstileToken.length > 2048 ||
      (body.locale !== 'es' && body.locale !== 'en')) return null;
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      [...email].some((char) => char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127)) return null;
  return { email, token: body.turnstileToken, locale: body.locale };
}

/** The config argument comes from a versioned build manifest, never from HTTP. */
export async function emailLinkRoute(request: Request, env: AuthBindings, manifest: Environment): Promise<Response> {
  let config: Environment;
  try { config = validateAuthConfig(env, manifest); }
  catch { return json(503, { error_code: 'SERVICE_UNAVAILABLE' }); }
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (url.origin !== config.api_origin || origin !== config.web_origin) {
    return json(403, { error_code: 'ORIGIN_NOT_ALLOWED' });
  }
  const allowedOrigin = config.web_origin;
  if (url.pathname !== EMAIL_LINK_PATH || url.search) return json(404, { error_code: 'NOT_FOUND' }, allowedOrigin);
  if (request.method === 'OPTIONS') {
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') ?? '').toLowerCase().split(',').map((v) => v.trim()).filter(Boolean);
    if (request.headers.get('Access-Control-Request-Method') !== 'POST' ||
        requestedHeaders.some((v) => !allowedHeaders.some((allowed) => allowed.toLowerCase() === v))) return json(403, { error_code: 'CORS_NOT_ALLOWED' }, allowedOrigin);
    const response = json(200, {}, allowedOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'POST');
    response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    response.headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    return response;
  }
  if (request.method !== 'POST') {
    const response = json(405, { error_code: 'METHOD_NOT_ALLOWED' }, allowedOrigin);
    response.headers.set('Allow', 'POST, OPTIONS');
    return response;
  }
  const incompatibility = requireCompatibleMutation(request, config, 'identity');
  if (incompatibility) return incompatibility;
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') ?? '') ||
      request.headers.has('Authorization') || request.headers.has('Cookie')) {
    return json(400, { error_code: 'INVALID_REQUEST' }, allowedOrigin);
  }
  const rawIp = request.headers.get('CF-Connecting-IP') ?? '';
  if (!isIP(rawIp)) return json(403, { error_code: 'CLIENT_IP_UNAVAILABLE' }, allowedOrigin);
  const ip = isIP(rawIp) === 6 ? new URL(`http://[${rawIp}]`).hostname : rawIp;
  let input: ReturnType<typeof inputBody>;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
  try { input = inputBody(await readJsonBounded<unknown>(new Response(request.body, { headers: request.headers }), 4096, signal)); }
  catch (error) { return json(error instanceof ResponseBodyTooLargeError ? 413 : 400, { error_code: 'INVALID_REQUEST' }, allowedOrigin); }
  if (!input) return json(400, { error_code: 'INVALID_REQUEST' }, allowedOrigin);
  const rateLimited = () => json(429, { error_code: 'RATE_LIMITED' }, allowedOrigin);
  try {
    const ipKey = await privateLimitKey(env, 'ip', ip);
    if (!(await consumeLimit(env.WALLET_DB, 'ip', ipKey, Math.floor(Date.now() / 1000)))) return rateLimited();
    signal.throwIfAborted();
    if (!(await verifyHuman(env, config, input.token, rawIp, signal))) {
      return json(403, { error_code: 'HUMAN_VERIFY_FAILED' }, allowedOrigin);
    }
    // Invalid challenges may spend only their own IP budget, never a victim's.
    const emailKey = await privateLimitKey(env, 'email', input.email);
    const now = Math.floor(Date.now() / 1000);
    if (!(await consumeLimit(env.WALLET_DB, 'email', emailKey, now))) return rateLimited();
    if (!(await consumeLimit(env.WALLET_DB, 'global', 'all', now))) return rateLimited();
    await pruneLimits(env.WALLET_DB, now);
    signal.throwIfAborted();
    await sendSignInLink(env, config, input.email, input.locale, signal);
    // Provider acceptance, NOT proof of inbox delivery or of an authenticated user.
    return json(202, { sent: true, resendAfterSeconds: 60 }, allowedOrigin);
  } catch {
    // Never return/log upstream bodies, URLs, email, IP, token or secrets.
    return json(503, { error_code: 'SERVICE_UNAVAILABLE' }, allowedOrigin);
  }
}
