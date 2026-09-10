import type { EnabledAuthConfig } from './config';

const PENDING_KEY = 'gatopago:v3:signin-request';
const TTL_MS = 60 * 60 * 1000;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PendingEmail = { schema: 1; project: string; email: string; requestedAt: number };

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  const control = Array.from(email).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  return !control && email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export function rememberEmail(storage: StorageLike, project: string, email: string, now: number): void {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Invalid email');
  try { storage.setItem(PENDING_KEY, JSON.stringify({ schema: 1, project, email: normalized, requestedAt: now })); }
  catch { /* Optional convenience, not authentication evidence. */ }
}
export function forgetEmail(storage: StorageLike): void {
  try { storage.removeItem(PENDING_KEY); } catch { /* Storage may be disabled. */ }
}
export function readPendingEmail(storage: StorageLike, project: string, now: number): PendingEmail | null {
  try {
    const raw = storage.getItem(PENDING_KEY);
    if (!raw || raw.length > 1024) return null;
    const item: unknown = JSON.parse(raw);
    if (typeof item !== 'object' || item === null) return null;
    const value = item as Partial<PendingEmail>;
    if (value.schema !== 1 || value.project !== project || typeof value.email !== 'string' ||
        normalizeEmail(value.email) !== value.email || typeof value.requestedAt !== 'number' ||
        !Number.isSafeInteger(value.requestedAt) || value.requestedAt > now || now - value.requestedAt > TTL_MS) {
      forgetEmail(storage);
      return null;
    }
    return value as PendingEmail;
  } catch { return null; }
}

export type EmailLanding = { kind: 'none' } | { kind: 'invalid' } | { kind: 'signin'; url: string };

/** Email is NEVER taken from URL state. Recovery and other Firebase actions are not login. */
export function parseEmailLanding(href: string, config: EnabledAuthConfig): EmailLanding {
  try {
    const link = new URL(href);
    if (link.origin !== config.webOrigin || link.pathname !== '/login' || link.username || link.password) return { kind: 'invalid' };
    const params = link.searchParams;
    if (!params.has('mode') && !params.has('oobCode') && !params.has('apiKey') && !params.has('continueUrl') &&
        (!params.has('flow') || params.get('flow') === 'signin')) return { kind: 'none' };
    if (href.length > 8192 || ['mode', 'oobCode', 'apiKey', 'continueUrl', 'flow'].some((key) => params.getAll(key).length > 1) ||
        params.get('mode') !== 'signIn' || params.get('apiKey') !== config.firebase.apiKey ||
        !/^[A-Za-z0-9_-]{1,2048}$/.test(params.get('oobCode') ?? '') ||
        (params.has('flow') && params.get('flow') !== 'signin')) return { kind: 'invalid' };
    if (params.has('continueUrl')) {
      const continuation = new URL(params.get('continueUrl')!);
      if (continuation.origin !== config.webOrigin || continuation.pathname !== '/login' ||
          continuation.username || continuation.password || continuation.hash ||
          continuation.searchParams.getAll('flow').length > 1 ||
          (continuation.searchParams.has('flow') && continuation.searchParams.get('flow') !== 'signin')) return { kind: 'invalid' };
    }
    // Drop all untrusted navigation/context fields before giving the link to the SDK.
    const clean = new URL('/login', config.webOrigin);
    for (const key of ['mode', 'oobCode', 'apiKey']) clean.searchParams.set(key, params.get(key)!);
    return { kind: 'signin', url: clean.href };
  } catch { return { kind: 'invalid' }; }
}

export function emailRequestBody(email: string, token: string, locale: 'es' | 'en') {
  const normalized = normalizeEmail(email);
  if (!normalized || !token.trim() || token.length > 2048) throw new Error('Invalid signin request');
  return { email: normalized, turnstileToken: token, locale };
}

export function parseSentResponse(value: unknown): number {
  if (!value || typeof value !== 'object') throw new Error('Invalid signin response');
  const result = value as { sent?: unknown; resendAfterSeconds?: unknown };
  if (result.sent !== true || typeof result.resendAfterSeconds !== 'number' ||
      !Number.isSafeInteger(result.resendAfterSeconds) || result.resendAfterSeconds < 60 || result.resendAfterSeconds > 3600) {
    throw new Error('Invalid signin response');
  }
  return result.resendAfterSeconds;
}
