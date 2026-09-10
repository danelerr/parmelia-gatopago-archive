import { describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { assertBrowserOrigin, authHeaders, authRewrites, buildAuthConfig, LOCAL_AUTH_PROJECT, LOCAL_WEB_ORIGIN, type EnabledAuthConfig } from '../src/auth/config';
import { emailRequestBody, forgetEmail, normalizeEmail, parseEmailLanding, parseSentResponse, readPendingEmail, rememberEmail } from '../src/auth/email-link';
import { createChallengeLifecycle, type ChallengeState } from '../src/auth/turnstile-lifecycle';

const staging = parseEnvironment(environments.staging);
const local = buildAuthConfig(staging, { nodeEnv: 'development', localAuth: '1' }) as EnabledAuthConfig;
const remoteEnvironment = { ...staging, status: 'provisioned' as const, firebase_project_id: 'gatopago-staging-test' };
const publicInputs = { apiKey: `AIza${'A'.repeat(35)}`, appId: '1:123456789:web:012345abcdef', turnstileSiteKey: `0x${'A'.repeat(22)}` };
const remote = buildAuthConfig(remoteEnvironment, publicInputs) as EnabledAuthConfig;
const validLink = `${LOCAL_WEB_ORIGIN}/login?mode=signIn&oobCode=synthetic_test_code&apiKey=fake-api-key`;

describe('V3 web auth environment', () => {
  it('does not invent Firebase resources for an unprovisioned environment', () => {
    expect(buildAuthConfig(staging, {})).toEqual({ mode: 'disabled' });
    expect(() => buildAuthConfig(staging, publicInputs)).toThrow('not provisioned');
  });
  it.each(['production', 'test', undefined])('rejects emulator in %s', (nodeEnv) => {
    expect(() => buildAuthConfig(staging, { nodeEnv, localAuth: '1' })).toThrow('development-only');
  });
  it('rejects emulator for the production deployment environment even in development', () => {
    expect(() => buildAuthConfig(parseEnvironment(environments.production), { nodeEnv: 'development', localAuth: '1' })).toThrow();
  });
  it('uses one fixed demo project and loopback only', () => {
    expect(local.firebase.projectId).toBe(LOCAL_AUTH_PROJECT);
    expect(local.emailRequestUrl).toBeNull();
    expect(() => assertBrowserOrigin(local, LOCAL_WEB_ORIGIN)).not.toThrow();
    for (const origin of ['http://127.0.0.1:3000', 'http://localhost:3001', staging.web_origin, 'https://example.test']) {
      expect(() => assertBrowserOrigin(local, origin)).toThrow();
    }
    expect(() => assertBrowserOrigin({ ...local, firebase: { ...local.firebase, projectId: 'real-project' } }, LOCAL_WEB_ORIGIN)).toThrow();
  });
  it('rejects mixed, partial or malformed auth configuration', () => {
    expect(() => buildAuthConfig(staging, { localAuth: 'true' })).toThrow();
    expect(() => buildAuthConfig(staging, { nodeEnv: 'development', localAuth: '1', ...publicInputs })).toThrow('mix');
    for (const field of ['apiKey', 'appId', 'turnstileSiteKey'] as const) {
      expect(() => buildAuthConfig(remoteEnvironment, { ...publicInputs, [field]: '' })).toThrow();
    }
    expect(() => buildAuthConfig({ ...remoteEnvironment, firebase_project_id: LOCAL_AUTH_PROJECT }, publicInputs)).toThrow();
  });
  it('derives authDomain and the guarded email endpoint from the environment, not legacy hosts', () => {
    expect(remote.firebase.authDomain).toBe('staging.gatopago.com');
    expect(remote.emailRequestUrl).toBe('https://api.staging.gatopago.com/app/v1/auth/email-link/request');
    expect(() => assertBrowserOrigin(remote, 'https://gatopago.com')).toThrow();
  });
  it('only rewrites the two Firebase helper namespaces', () => {
    expect(authRewrites({ mode: 'disabled' })).toEqual([]);
    expect(authRewrites(local)).toEqual([]);
    expect(authRewrites(remote)).toEqual([
      { source: '/__/auth/:path*', destination: 'https://gatopago-staging-test.firebaseapp.com/__/auth/:path*' },
      { source: '/__/firebase/:path*', destination: 'https://gatopago-staging-test.firebaseapp.com/__/firebase/:path*' },
    ]);
    expect(() => authRewrites({ ...remote, firebase: { ...remote.firebase, projectId: 'example.test/../../' } })).toThrow();
  });
  it('does not cache auth/account content and permits ONLY the same-origin Firebase helper frame', () => {
    const rules = authHeaders();
    expect(rules.map((rule) => rule.source)).toEqual(['/login', '/app/:path*', '/settings/:path*', '/__/auth/:path*', '/__/firebase/:path*']);
    for (const rule of rules) {
      expect(rule.headers).toContainEqual({ key: 'Cache-Control', value: 'private, no-store, max-age=0' });
      expect(rule.headers).toContainEqual({ key: 'CDN-Cache-Control', value: 'no-store' });
      expect(rule.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
      expect(rule.headers.some((header) => header.key === 'X-Frame-Options')).toBe(rule.source === '/__/auth/:path*');
    }
    expect(rules.find((rule) => rule.source === '/__/auth/:path*')!.headers).toContainEqual({ key: 'X-Frame-Options', value: 'SAMEORIGIN' });
  });
});

describe('V3 signin link parsing', () => {
  it('accepts the matching origin, project and signin action', () => {
    expect(parseEmailLanding(validLink, local)).toEqual({ kind: 'signin', url: validLink });
    expect(parseEmailLanding(`${LOCAL_WEB_ORIGIN}/login`, local)).toEqual({ kind: 'none' });
  });
  it.each([
    validLink.replace('signIn', 'resetPassword'), validLink.replace('fake-api-key', 'another-project-key'),
    validLink.replace('/login?', '/app?'), validLink.replace('localhost:3000', 'example.test'),
    `${validLink}&mode=signIn`, `${validLink}&flow=recovery`, `${validLink}&oobCode=second`,
    `${LOCAL_WEB_ORIGIN}/login?oobCode=synthetic`, `${LOCAL_WEB_ORIGIN}/login?flow=recovery`,
    `${validLink}&continueUrl=${encodeURIComponent('https://example.test/login')}`,
    `${validLink}&continueUrl=${encodeURIComponent(`${LOCAL_WEB_ORIGIN}/login?flow=recovery`)}`,
  ])('rejects a mismatched or ambiguous link (%#)', (link) => {
    expect(parseEmailLanding(link, local)).toEqual({ kind: 'invalid' });
  });
  it('does not obtain email or navigation from the URL', () => {
    const url = `${validLink}&email=someone%40example.test&next=https://example.test&continueUrl=${encodeURIComponent(`${LOCAL_WEB_ORIGIN}/login?flow=signin`)}`;
    expect(parseEmailLanding(url, local)).toEqual({ kind: 'signin', url: validLink });
  });
  it('bounds link size', () => expect(parseEmailLanding(`${validLink}&x=${'a'.repeat(8192)}`, local)).toEqual({ kind: 'invalid' }));
});

describe('optional same-device email hint', () => {
  function store() {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  }
  it('expires, is project-bound, rejects future timestamps and clears after use', () => {
    const storage = store();
    rememberEmail(storage, LOCAL_AUTH_PROJECT, ' PERSON@example.test ', 1000);
    expect(readPendingEmail(storage, LOCAL_AUTH_PROJECT, 2000)?.email).toBe('person@example.test');
    expect(readPendingEmail(storage, LOCAL_AUTH_PROJECT, 999)).toBeNull();
    rememberEmail(storage, LOCAL_AUTH_PROJECT, 'person@example.test', 1000);
    expect(readPendingEmail(storage, LOCAL_AUTH_PROJECT, 3_601_001)).toBeNull();
    rememberEmail(storage, LOCAL_AUTH_PROJECT, 'person@example.test', 1000);
    expect(readPendingEmail(storage, 'other-project', 2000)).toBeNull();
    rememberEmail(storage, LOCAL_AUTH_PROJECT, 'person@example.test', 1000);
    forgetEmail(storage);
    expect(readPendingEmail(storage, LOCAL_AUTH_PROJECT, 2000)).toBeNull();
  });
  it('does not make login depend on localStorage availability', () => {
    const fail = () => { throw new Error('Storage blocked'); };
    const storage = { getItem: fail, setItem: fail, removeItem: fail };
    expect(() => rememberEmail(storage, LOCAL_AUTH_PROJECT, 'person@example.test', 1000)).not.toThrow();
    expect(readPendingEmail(storage, LOCAL_AUTH_PROJECT, 2000)).toBeNull();
    expect(() => forgetEmail(storage)).not.toThrow();
  });
  it.each(['a\n@example.test', 'a\u0000@example.test', 'a b@example.test', 'invalid', 'a@b', `${'a'.repeat(255)}@example.test`])('rejects an invalid email (%#)', (email) => expect(normalizeEmail(email)).toBeNull());
});

describe('guarded email request/response', () => {
  it('requires a token in remote mode and does not include a client-controlled continueUrl', () => {
    expect(() => emailRequestBody('person@example.test', '', 'es')).toThrow();
    expect(() => emailRequestBody('person@example.test', 'x'.repeat(2049), 'es')).toThrow();
    expect(emailRequestBody('Person@example.test', 'token', 'en')).toEqual({ email: 'person@example.test', turnstileToken: 'token', locale: 'en' });
  });
  it('only accepts explicit delivery acknowledgement with bounded cooldown', () => {
    expect(parseSentResponse({ sent: true, resendAfterSeconds: 60 })).toBe(60);
    for (const value of [null, {}, { sent: false, resendAfterSeconds: 60 }, { sent: true, resendAfterSeconds: -1 }, { sent: true, resendAfterSeconds: 60.5 }, { sent: true, resendAfterSeconds: 3601 }]) {
      expect(() => parseSentResponse(value)).toThrow();
    }
  });
});

describe('Turnstile lifecycle (no external challenge)', () => {
  it.each(['expired', 'error'] as const)('invalidates a previously approved token on %s', (reason) => {
    const states: ChallengeState[] = [];
    const challenge = createChallengeLifecycle((state) => states.push(state));
    challenge.verified('one-use-token'); challenge.invalidate(reason); challenge.verified('late-token');
    expect(states).toEqual([{ status: 'verified', token: 'one-use-token' }, { status: reason, token: null }]);
  });
  it('ignores all callbacks after unmount and rejects empty tokens', () => {
    const publish = vi.fn(); const challenge = createChallengeLifecycle(publish);
    challenge.verified(''); expect(publish).toHaveBeenLastCalledWith({ status: 'error', token: null });
    publish.mockClear(); challenge.dispose(); challenge.invalidate('error'); challenge.verified('late');
    expect(publish).not.toHaveBeenCalled();
  });
});
