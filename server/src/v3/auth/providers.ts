import { discardResponseBody, readJsonBounded } from '../../services/http';
import type { Environment } from '../../../../packages/environment';
import type { AuthBindings } from './config';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function verifyHuman(env: AuthBindings, config: Environment, token: string,
  ip: string, signal: AbortSignal): Promise<boolean> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', redirect: 'error', signal: deadline,
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
  });
  if (!response.ok) { await discardResponseBody(response); throw new Error('Siteverify unavailable'); }
  const data = await readJsonBounded<unknown>(response, 16 * 1024, deadline);
  return record(data) && data.success === true && data.action === 'email_login' &&
    data.hostname === new URL(config.web_origin).hostname;
}

export async function sendSignInLink(env: AuthBindings, config: Environment,
  email: string, locale: 'es' | 'en', signal: AbortSignal): Promise<void> {
  const continueUrl = new URL('/login', config.web_origin);
  continueUrl.searchParams.set('flow', 'signin');
  continueUrl.searchParams.set('lang', locale);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  // One bounded send. Retrying an uncertain result can send another email.
  // No returnOobLink, identity lookup, custom token or recovery capability.
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST', redirect: 'error', signal: deadline,
    headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': locale },
    body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email,
      continueUrl: continueUrl.toString(), canHandleCodeInApp: true }),
  });
  if (!response.ok) { await discardResponseBody(response); throw new Error('Firebase send unavailable'); }
  const data = await readJsonBounded<unknown>(response, 16 * 1024, deadline);
  if (!record(data) || typeof data.email !== 'string' || data.email.trim().toLowerCase() !== email) {
    throw new Error('Firebase did not acknowledge the recipient');
  }
}
