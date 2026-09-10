import { env, exports } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import manifests from '../../../packages/environment/environments.json';
import { parseEnvironment } from '../../../packages/environment';
import { emailLinkRoute, EMAIL_LINK_PATH } from '../../src/v3/auth/route';
import { consumeLimit, privateLimitKey, pruneLimits } from '../../src/v3/auth/limits';
import { readJsonBounded } from '../../src/services/http';
import type { AuthBindings } from '../../src/v3/auth/config';
import { CLIENT_COMPATIBILITY_PATH, CLIENT_RELEASE_HEADERS, CLIENT_RELEASE_ID, CLIENT_STATUS_HEADER, WALLET_API_VERSION, clientMutationHeaders } from '../../../shared/v3/clientRelease';

const config = parseEnvironment({ ...manifests.staging, status: 'provisioned', firebase_project_id: 'v3-runtime-test' });
const body = { email: 'person@example.test', locale: 'es', turnstileToken: 'synthetic-one-use-token' };
const origin = config.web_origin;
const url = `${config.api_origin}${EMAIL_LINK_PATH}`;
const now = () => Math.floor(Date.now() / 1000);

function request(input: unknown = body, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json',
    Origin: origin, 'CF-Connecting-IP': '192.0.2.10', ...clientMutationHeaders('staging'), ...headers }, body: JSON.stringify(input) });
}

function providerMock(human: unknown = { success: true, hostname: 'staging.gatopago.com', action: 'email_login' }) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const providerUrl = String(input);
    if (providerUrl === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json(human);
    if (providerUrl.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=')) {
      const data = JSON.parse(String(init?.body)) as { email: string };
      return Response.json({ email: data.email });
    }
    throw new Error('Unexpected outbound request');
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

async function run(input = request(), bindings: AuthBindings = env) {
  return emailLinkRoute(input, bindings, config);
}

beforeAll(async () => { await applyD1Migrations(env.WALLET_DB, env.V3_TEST_MIGRATIONS); });
beforeEach(async () => { await env.WALLET_DB.exec('DELETE FROM auth_send_limits'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('V3 isolated entrypoint', () => {
  it('publishes a read-only no-store compatibility policy even before provisioning, without enabling accounts', async () => {
    const calls = providerMock();
    const result = await exports.default.fetch(config.api_origin + CLIENT_COMPATIBILITY_PATH, { headers: { Origin: origin } });
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(await result.json()).toEqual({
      policy_version: 1, environment: 'staging', environment_status: 'unprovisioned',
      api_version: WALLET_API_VERSION, minimum_mutating_release: CLIENT_RELEASE_ID,
      accepted_mutating_releases: [CLIENT_RELEASE_ID], account_profiles: [],
    });
    expect(calls).not.toHaveBeenCalled();
    expect(await env.WALLET_DB.prepare('SELECT count(*) AS n FROM auth_send_limits').first('n')).toBe(0);
  });
  it('does not accept writes, redirects, foreign origins or query parameters at the policy endpoint', async () => {
    const policyUrl = config.api_origin + CLIENT_COMPATIBILITY_PATH;
    expect((await exports.default.fetch(policyUrl, { method: 'POST' })).status).toBe(405);
    expect((await exports.default.fetch(policyUrl + '?redirect=https://evil.test')).status).toBe(404);
    const foreign = await exports.default.fetch(policyUrl, { headers: { Origin: 'https://gatopago.com' } });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect((await exports.default.fetch('https://api.gatopago.com' + CLIENT_COMPATIBILITY_PATH)).status).toBe(403);
  });
  it('is live but not ready and fails closed with the actual unprovisioned manifest', async () => {
    const live = await exports.default.fetch('https://local.invalid/health/live');
    expect(await live.json()).toEqual({ service: 'wallet-core-v3', status: 'ok', ready: false });
    const result = await exports.default.fetch(request());
    expect(result.status).toBe(503);
    expect(await env.WALLET_DB.prepare('SELECT count(*) AS n FROM auth_send_limits').first('n')).toBe(0);
  });
  it.each(['/auth/email-code/request', '/auth/step-up/request', '/account/recovery', '/pay', '/v1/payment_intents'])('does not mount %s', async (path) => {
    const result = await exports.default.fetch(`https://local.invalid${path}`, { method: 'POST' });
    expect(result.status).toBe(404);
  });
});

describe('V3 sign-in boundary with real D1 and mocked external providers', () => {
  it.each(Object.values(CLIENT_RELEASE_HEADERS))('rejects missing or duplicate %s before reading the body or doing any I/O', async (name) => {
    const calls = providerMock();
    for (const duplicate of [false, true]) {
      const input = request();
      if (duplicate) input.headers.append(name, input.headers.get(name)!);
      else input.headers.delete(name);
      const response = await run(input);
      expect(response.status).toBe(409);
      expect(response.headers.get(CLIENT_STATUS_HEADER)).toBe('update-required');
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe(CLIENT_STATUS_HEADER);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect((await response.json<{ error_code: string }>()).error_code).toBe('CLIENT_UPDATE_REQUIRED');
      expect(input.bodyUsed).toBe(false);
    }
    expect(calls).not.toHaveBeenCalled();
    expect(await env.WALLET_DB.prepare('SELECT count(*) AS n FROM auth_send_limits').first('n')).toBe(0);
  });
  it.each([
    [CLIENT_RELEASE_HEADERS.release, 'web-v3-e2-r0'], [CLIENT_RELEASE_HEADERS.release, 'web-v3-e2-r999'],
    [CLIENT_RELEASE_HEADERS.api, 'wallet-core-v3.0'], [CLIENT_RELEASE_HEADERS.environment, 'production'],
    [CLIENT_RELEASE_HEADERS.generation, '3'], [CLIENT_RELEASE_HEADERS.manifest, 'evm-v3-r1'],
  ])('does not accept a mismatched release declaration %s=%s', async (name, value) => {
    const calls = providerMock();
    expect((await run(request(body, { [name]: value }))).status).toBe(409);
    expect(calls).not.toHaveBeenCalled();
    expect(await env.WALLET_DB.prepare('SELECT count(*) AS n FROM auth_send_limits').first('n')).toBe(0);
  });
  it('sends exactly one sign-in email with canonical continue URL, no authority or sensitive response', async () => {
    const calls = providerMock();
    const response = await run(request({ ...body, email: ' Person@Example.Test ', locale: 'en' }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ sent: true, resendAfterSeconds: 60 });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(calls).toHaveBeenCalledTimes(2);
    expect(calls.mock.calls[0][1]?.redirect).toBe('error');
    expect(calls.mock.calls[1][1]?.redirect).toBe('error');
    expect(JSON.parse(String(calls.mock.calls[1][1]?.body))).toEqual({
      email: 'person@example.test', requestType: 'EMAIL_SIGNIN', canHandleCodeInApp: true,
      continueUrl: 'https://staging.gatopago.com/login?flow=signin&lang=en',
    });
    const rows = await env.WALLET_DB.prepare('SELECT * FROM auth_send_limits').all();
    expect(rows.results).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toContain('person@example.test');
    expect(JSON.stringify(rows)).not.toContain('192.0.2.10');
    expect(JSON.stringify(rows)).not.toContain(body.turnstileToken);
  });

  it.each([
    { FIREBASE_PROJECT_ID: 'wrong-project' }, { GATOPAGO_ENVIRONMENT: 'production' },
    { FIREBASE_WEB_API_KEY: '' }, { TURNSTILE_SECRET_KEY: '' },
    { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }, { AUTH_RATE_LIMIT_PEPPER: '' },
  ])('rejects incomplete/mixed config %j before any I/O', async (change) => {
    const calls = providerMock();
    expect((await run(request(), { ...env, ...change })).status).toBe(503);
    expect(calls).not.toHaveBeenCalled();
    expect(await env.WALLET_DB.prepare('SELECT count(*) AS n FROM auth_send_limits').first('n')).toBe(0);
  });

  it.each(['https://gatopago.com', 'https://business.staging.gatopago.com', 'https://staging.gatopago.com.evil.test', 'null', ''])('rejects browser origin %s without CORS', async (other) => {
    const calls = providerMock();
    const response = await run(request(body, { Origin: other }));
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(calls).not.toHaveBeenCalled();
  });

  it('does not accept a request at another environment API', async () => {
    providerMock();
    const req = request();
    expect((await run(new Request('https://api.gatopago.com' + EMAIL_LINK_PATH, req))).status).toBe(403);
  });

  it('handles only narrowly scoped preflight and never verifies/sends on OPTIONS', async () => {
    const calls = providerMock();
    const preflight = (method: string, headers: string) => new Request(url, { method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': headers } });
    const ok = await run(preflight('POST', ['content-type', ...Object.values(CLIENT_RELEASE_HEADERS)].join(', ')));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Methods')).toBe('POST');
    for (const name of Object.values(CLIENT_RELEASE_HEADERS)) expect(ok.headers.get('Access-Control-Allow-Headers')).toContain(name);
    expect(ok.headers.get('Vary')).toContain('Access-Control-Request-Headers');
    expect((await run(preflight('DELETE', 'content-type'))).status).toBe(403);
    expect((await run(preflight('POST', 'authorization'))).status).toBe(403);
    expect(calls).not.toHaveBeenCalled();
  });

  it('rejects query parameters, unsupported methods and form requests before any provider call', async () => {
    const calls = providerMock();
    expect((await run(new Request(url + '?flow=recovery', request()))).status).toBe(404);
    const get = await run(new Request(url, { headers: { Origin: origin } }));
    expect(get.status).toBe(405);
    expect(get.headers.get('Allow')).toBe('POST, OPTIONS');
    expect((await run(request(body, { 'Content-Type': 'text/plain' }))).status).toBe(400);
    expect(calls).not.toHaveBeenCalled();
  });

  it.each([
    { ...body, continueUrl: 'https://evil.test' }, { ...body, uid: 'victim' },
    { ...body, flow: 'recovery' }, { ...body, returnOobLink: true },
    { ...body, locale: 'unknown' }, { ...body, email: 'a@b@c.test' },
    { ...body, email: 'a\u0000@b.test' }, { ...body, turnstileToken: 'x'.repeat(2049) },
    { ...body, turnstileToken: '' }, [], null,
  ])('rejects invalid or extra request fields %j', async (input) => {
    const calls = providerMock();
    expect((await run(request(input))).status).toBe(400);
    expect(calls).not.toHaveBeenCalled();
  });

  it('rejects oversized stream bodies, malformed JSON, cookie auth, bearer auth and missing edge IP', async () => {
    const calls = providerMock();
    expect((await run(request({ ...body, extra: 'x'.repeat(5000) }))).status).toBe(413);
    expect((await run(new Request(url, { method: 'POST', headers: request().headers, body: '{' }))).status).toBe(400);
    expect((await run(request(body, { Cookie: 'session=not-accepted' }))).status).toBe(400);
    expect((await run(request(body, { Authorization: 'Bearer not-accepted' }))).status).toBe(400);
    expect((await run(request(body, { 'CF-Connecting-IP': '', 'X-Forwarded-For': '192.0.2.20' }))).status).toBe(403);
    expect(calls).not.toHaveBeenCalled();
  });

  it.each([{ success: false }, { success: true, hostname: 'gatopago.com', action: 'email_login' },
    { success: true, hostname: 'staging.gatopago.com', action: 'account_create' }, null])('rejects invalid Siteverify evidence %j without exhausting email/global quota', async (human) => {
    const calls = providerMock(human);
    expect((await run()).status).toBe(403);
    expect(calls).toHaveBeenCalledTimes(1);
    const rows = await env.WALLET_DB.prepare('SELECT scope FROM auth_send_limits').all();
    expect(rows.results).toEqual([{ scope: 'ip' }]);
  });

  it('allows only one simultaneous request per recipient cooldown, even from many IPs', async () => {
    const calls = providerMock();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      run(request(body, { 'CF-Connecting-IP': `192.0.2.${i + 1}` }))));
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(11);
    expect(calls.mock.calls.filter(([u]) => String(u).includes('sendOobCode'))).toHaveLength(1);
  });

  it('retains cooldown after an uncertain Firebase outcome, returns no upstream detail and never retries', async () => {
    const calls = providerMock();
    calls.mockImplementationOnce(async () => Response.json({ success: true, hostname: 'staging.gatopago.com', action: 'email_login' }));
    calls.mockImplementationOnce(async () => { throw new Error('provider leaked person@example.test synthetic-secret'); });
    const response = await run();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error_code":"SERVICE_UNAVAILABLE"}');
    expect(calls).toHaveBeenCalledTimes(2);
    expect((await run()).status).toBe(429);
    expect(calls.mock.calls.filter(([u]) => String(u).includes('sendOobCode'))).toHaveLength(1);
  });

  it('rejects a replayed token instead of treating the previous verification as a cached permission', async () => {
    const calls = providerMock();
    expect((await run()).status).toBe(202);
    calls.mockImplementationOnce(async () => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    expect((await run(request({ ...body, email: 'another@example.test' }))).status).toBe(403);
    expect(calls.mock.calls.filter(([u]) => String(u).includes('sendOobCode'))).toHaveLength(1);
  });

  it('times out and cancels a stalled Siteverify response body without touching recipient quota', async () => {
    const calls = providerMock();
    const cancel = vi.fn();
    calls.mockImplementationOnce(async () => new Response(new ReadableStream({ cancel })));
    expect((await run()).status).toBe(503);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(calls).toHaveBeenCalledTimes(1);
    expect((await env.WALLET_DB.prepare('SELECT scope FROM auth_send_limits').all()).results).toEqual([{ scope: 'ip' }]);
  }, 7000);

  it('times out an uncertain Firebase body once, preserving the send hold', async () => {
    const calls = providerMock();
    const cancel = vi.fn();
    calls.mockImplementationOnce(async () => Response.json({ success: true, hostname: 'staging.gatopago.com', action: 'email_login' }));
    calls.mockImplementationOnce(async () => new Response(new ReadableStream({ cancel })));
    expect((await run()).status).toBe(503);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect((await run()).status).toBe(429);
    expect(calls.mock.calls.filter(([u]) => String(u).includes('sendOobCode'))).toHaveLength(1);
  }, 9000);

  it.each([Response.json({ email: 'wrong@example.test' }), Response.json(null),
    new Response('malformed'), new Response('x'.repeat(17000)), new Response('private upstream', { status: 500 })])('never reports a bad Firebase acknowledgement as sent', async (bad) => {
    const calls = providerMock();
    calls.mockImplementationOnce(async () => Response.json({ success: true, hostname: 'staging.gatopago.com', action: 'email_login' }));
    calls.mockImplementationOnce(async () => bad.clone());
    expect((await run()).status).toBe(503);
    expect(calls).toHaveBeenCalledTimes(2);
  });
});

describe('D1 quota invariants', () => {
  it('enforces exact IP budget atomically under contention', async () => {
    const results = await Promise.all(Array.from({ length: 35 }, () => consumeLimit(env.WALLET_DB, 'ip', 'synthetic', 1000)));
    expect(results.filter(Boolean)).toHaveLength(20);
    const row = await env.WALLET_DB.prepare('SELECT count, reset_at FROM auth_send_limits').first();
    expect(row).toEqual({ count: 20, reset_at: 4600 });
    expect(await consumeLimit(env.WALLET_DB, 'ip', 'synthetic', 4599)).toBe(false);
    expect(await consumeLimit(env.WALLET_DB, 'ip', 'synthetic', 4600)).toBe(true);
  });
  it('enforces cooldown and 3-per-15-minute recipient limit without extending it on rejection', async () => {
    for (const time of [1000, 1060, 1120]) expect(await consumeLimit(env.WALLET_DB, 'email', 'recipient', time)).toBe(true);
    for (const time of [1121, 1180, 1899]) expect(await consumeLimit(env.WALLET_DB, 'email', 'recipient', time)).toBe(false);
    expect(await env.WALLET_DB.prepare('SELECT count, reset_at, next_allowed_at FROM auth_send_limits').first())
      .toEqual({ count: 3, reset_at: 1900, next_allowed_at: 1180 });
    expect(await consumeLimit(env.WALLET_DB, 'email', 'recipient', 1900)).toBe(true);
  });
  it('global exhaustion blocks sending after a valid challenge', async () => {
    const calls = providerMock();
    await env.WALLET_DB.prepare("INSERT INTO auth_send_limits VALUES ('global','all',2000,?,0)").bind(now() + 3600).run();
    expect((await run()).status).toBe(429);
    expect(calls).toHaveBeenCalledTimes(1);
  });
  it('fails closed on missing schema, before either provider is called', async () => {
    const calls = providerMock();
    await env.WALLET_DB.exec('ALTER TABLE auth_send_limits RENAME TO saved_limits');
    try { expect((await run()).status).toBe(503); expect(calls).not.toHaveBeenCalled(); }
    finally { await env.WALLET_DB.exec('ALTER TABLE saved_limits RENAME TO auth_send_limits'); }
  });
  it('separates hashed identifiers by environment and scope', async () => {
    const key = await privateLimitKey(env, 'email', 'person@example.test');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toBe(await privateLimitKey(env, 'ip', 'person@example.test'));
    expect(key).not.toBe(await privateLimitKey({ ...env, GATOPAGO_ENVIRONMENT: 'production' }, 'email', 'person@example.test'));
  });
  it('prunes only expired entries and leaves current holds intact', async () => {
    await consumeLimit(env.WALLET_DB, 'ip', 'old', 1000);
    await consumeLimit(env.WALLET_DB, 'email', 'current', 4000);
    await pruneLimits(env.WALLET_DB, 4600);
    expect((await env.WALLET_DB.prepare('SELECT key_hash FROM auth_send_limits').all()).results).toEqual([{ key_hash: 'current' }]);
  });
  it('cancels a stalled body read when the deadline aborts', async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const pending = readJsonBounded(new Response(new ReadableStream({ cancel })), 4096, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('also releases an unread body when the request was already aborted', async () => {
    const cancel = vi.fn();
    await expect(readJsonBounded(new Response(new ReadableStream({ cancel })), 4096, AbortSignal.abort())).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
