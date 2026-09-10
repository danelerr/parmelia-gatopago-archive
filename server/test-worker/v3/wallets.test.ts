import { env, exports } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import manifests from '../../../packages/environment/environments.json';
import { parseEnvironment } from '../../../packages/environment';
import { createResourceId } from '../../../shared/v3/primitives';
import { clientMutationHeaders } from '../../../shared/v3/clientRelease';
import { walletReadRoute } from '../../src/v3/wallets/route';
import { WalletRepository } from '../../src/v3/wallets/repository';
import { verifyConsumerIdentity } from '../../src/v3/auth/identity';
import { inspectOwnedWalletAccount } from '../../src/v3/wallets/inspection';
import { finalizedSecurityScenario } from '../../test/fixtures/v3SecurityInspection';
import { clearIdentityKeys, projectId, testIdentitySigner, unixNow } from './identity.fixture';

const config = parseEnvironment({ ...manifests.staging, status: 'provisioned', firebase_project_id: projectId });
let signer: Awaited<ReturnType<typeof testIdentitySigner>>;
const now = unixNow();
type Session = { user_id: string; party_id: string };

async function input(path = '/session', method = 'GET', subject = 'test-user-a', body: unknown = {}) {
	return new Request(`${config.api_origin}/app/v1${path}`, { method, headers: {
		Origin: config.web_origin, Authorization: `Bearer ${await signer.token({ sub: subject, auth_time: now - 100 })}`,
		'Content-Type': 'application/json', ...clientMutationHeaders('staging'),
	}, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
const run = (request: Request) => walletReadRoute(request, env, config);
async function session(subject = 'test-user-a') {
	const result = await run(await input('/session', 'POST', subject));
	expect(result.status).toBe(200);
	return result.json<Session>();
}
async function repository(subject = 'test-user-a') {
	return new WalletRepository(env.WALLET_DB, await verifyConsumerIdentity(await input('/wallets', 'GET', subject), projectId));
}
async function seedWallet(owner: Session) {
	const id = createResourceId('wallet');
	await env.WALLET_DB.prepare(`INSERT INTO wallets (id, owner_party_id, controller, account_kind, status, created_at)
		VALUES (?, ?, 'end_user', 'evm_smart_account', 'active', ?)`).bind(id, owner.party_id, now).run();
	return id;
}
async function seedAccount(owner: Session, addressOverride?: string) {
	const scenario = finalizedSecurityScenario();
	const walletId = await seedWallet(owner);
	const identityId = createResourceId('accountIdentity');
	const accountId = createResourceId('walletAccount');
	await env.WALLET_DB.batch([
		env.WALLET_DB.prepare(`INSERT INTO account_identities
			(id, wallet_id, account_id, generation, initial_security_commitment, user_salt_commitment, canonical_address, created_at)
			VALUES (?, ?, ?, 3, ?, ?, ?, ?)`).bind(identityId, walletId, scenario.state.observation.accountId,
				scenario.input.initialSecurityCommitment, scenario.input.userSaltCommitment, addressOverride ?? scenario.account.toLowerCase(), now),
		env.WALLET_DB.prepare(`INSERT INTO account_instances
			(account_identity_id, network_id, address, generation, deployment_manifest_sha256, deployment_state, created_at)
			VALUES (?, ?, ?, 3, ?, 'active', ?)`).bind(identityId, scenario.manifest.network_id, addressOverride ?? scenario.account.toLowerCase(), scenario.input.expectedDigest, now),
		env.WALLET_DB.prepare(`INSERT INTO wallet_accounts (id, wallet_id, account_identity_id, network_id, created_at)
			VALUES (?, ?, ?, ?, ?)`).bind(accountId, walletId, identityId, scenario.manifest.network_id, now),
	]);
	return { walletId, identityId, accountId, scenario };
}
const countIdentities = () => env.WALLET_DB.prepare('SELECT count(*) AS n FROM user_identities').first('n');

beforeAll(async () => {
	await applyD1Migrations(env.WALLET_DB, env.V3_TEST_MIGRATIONS);
	signer = await testIdentitySigner();
});
beforeEach(async () => {
	await clearIdentityKeys();
	// This binding is ephemeral local D1, never the legacy or remote database.
	await env.WALLET_DB.exec(`DELETE FROM wallet_accounts; DELETE FROM account_instances; DELETE FROM account_identities;
		DELETE FROM wallets; DELETE FROM parties; DELETE FROM user_identities;`);
	signer.mock();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('V3 Consumer session and ownership with real D1', () => {
	it('mounts private routes but does not bypass the actual unprovisioned manifest', async () => {
		for (const path of ['/session', '/wallets', `/wallets/${createResourceId('wallet')}/accounts`]) {
			expect((await exports.default.fetch(await input(path))).status).toBe(503);
		}
		expect(await countIdentities()).toBe(0);
	});
	it('GET never implicitly onboards; POST creates identity and Party but no wallet/signer/account', async () => {
		const before = await run(await input());
		expect(before.status).toBe(409);
		expect(await countIdentities()).toBe(0);
		const first = await session();
		expect(first).toEqual({ user_id: expect.stringMatching(/^usr_/), party_id: expect.stringMatching(/^pty_/) });
		const get = await run(await input());
		expect(await get.json()).toEqual(first);
		expect(get.headers.get('Cache-Control')).toBe('no-store');
		expect(get.headers.get('CDN-Cache-Control')).toBe('no-store');
		expect(get.headers.get('Access-Control-Allow-Origin')).toBe(config.web_origin);
		expect(get.headers.get('Set-Cookie')).toBeNull();
		expect(await env.WALLET_DB.prepare('SELECT count(*) AS n FROM wallets').first('n')).toBe(0);
		expect(await env.WALLET_DB.prepare('SELECT count(*) AS n FROM account_identities').first('n')).toBe(0);
	});
	it('concurrent and repeated sign-ins produce exactly one identity/Party', async () => {
		const sessions = await Promise.all(Array.from({ length: 10 }, () => session()));
		expect(sessions.every((value) => JSON.stringify(value) === JSON.stringify(sessions[0]))).toBe(true);
		expect(await countIdentities()).toBe(1);
		expect(await env.WALLET_DB.prepare('SELECT count(*) AS n FROM parties').first('n')).toBe(1);
	});
	it('rolls back the identity insert if the Party write fails', async () => {
		await env.WALLET_DB.exec(`CREATE TRIGGER reject_test_party BEFORE INSERT ON parties BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
		try {
			expect((await run(await input('/session', 'POST'))).status).toBe(503);
			expect(await countIdentities()).toBe(0);
		} finally { await env.WALLET_DB.exec('DROP TRIGGER reject_test_party'); }
	});
	it('never links users by email or exposes Firebase subjects', async () => {
		const results: Session[] = [];
		for (const sub of ['one', 'two']) {
			const request = await input('/session', 'POST');
			request.headers.set('Authorization', `Bearer ${await signer.token({ sub, email: 'same@example.test' })}`);
			results.push(await (await run(request)).json<Session>());
		}
		expect(results[0].user_id).not.toBe(results[1].user_id);
		expect(results[0].party_id).not.toBe(results[1].party_id);
		expect(Object.keys(results[0]).sort()).toEqual(['party_id', 'user_id']);
	});
	it('does not link identical subjects across Firebase projects', async () => {
		const first = await session();
		const request = await input('/session', 'POST');
		request.headers.set('Authorization', `Bearer ${await signer.token({ aud: 'other-runtime', iss: 'https://securetoken.google.com/other-runtime' })}`);
		const response = await walletReadRoute(request, { ...env, FIREBASE_PROJECT_ID: 'other-runtime' }, parseEnvironment({ ...config, firebase_project_id: 'other-runtime' }));
		expect(response.status).toBe(200);
		expect((await response.json<Session>()).user_id).not.toBe(first.user_id);
		expect(await countIdentities()).toBe(2);
	});
	it('requires exact origin and API hostname before any identity or D1 call', async () => {
		const fetchMock = signer.mock();
		for (const origin of ['https://gatopago.com', 'https://other.staging.gatopago.com', 'null', '']) {
			const request = await input('/session', 'POST');
			if (origin) request.headers.set('Origin', origin); else request.headers.delete('Origin');
			const response = await run(request);
			expect(response.status).toBe(403); expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
		}
		const request = await input('/session', 'POST');
		expect((await run(new Request('https://api.gatopago.com/app/v1/session', request))).status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled(); expect(await countIdentities()).toBe(0);
	});
	it('allows bounded CORS preflight, not cookies, unsupported methods or unversioned writes', async () => {
		const fetchMock = signer.mock();
		const request = await input();
		const preflight = new Request(request.url, { method: 'OPTIONS', headers: { Origin: config.web_origin,
			'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } });
		expect((await run(preflight)).status).toBe(200);
		preflight.headers.set('Access-Control-Request-Headers', 'cookie');
		expect((await run(preflight)).status).toBe(403);
		expect((await run(await input('/wallets', 'POST'))).status).toBe(405);
		const stale = await input('/session', 'POST'); stale.headers.delete('X-GatoPago-Client-Release');
		// Remove all version headers so spelling cannot weaken the regression.
		for (const name of Object.keys(clientMutationHeaders('staging'))) stale.headers.delete(name);
		expect((await run(stale)).status).toBe(409);
		const cookie = await input('/session', 'POST'); cookie.headers.set('Cookie', 'session=untrusted');
		expect((await run(cookie)).status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled(); expect(await countIdentities()).toBe(0);
	});
	it('rejects injected ownership and oversized bodies before validating identity', async () => {
		const fetchMock = signer.mock();
		for (const body of [null, [], { uid: 'victim' }, { wallet_id: createResourceId('wallet') }, { address: '0x123' }]) {
			expect((await run(await input('/session', 'POST', 'test-user-a', body))).status).toBe(400);
		}
		expect((await run(await input('/session', 'POST', 'test-user-a', { huge: 'x'.repeat(1025) }))).status).toBe(413);
		expect(fetchMock).not.toHaveBeenCalled(); expect(await countIdentities()).toBe(0);
	});
	it('disabled users stay disabled and revoked authentication cannot be restored by refreshing iat', async () => {
		const first = await session();
		await env.WALLET_DB.prepare('UPDATE user_identities SET disabled_at = ? WHERE id = ?').bind(now, first.user_id).run();
		for (const method of ['GET', 'POST']) expect((await run(await input('/session', method))).status).toBe(401);
		await env.WALLET_DB.prepare('UPDATE user_identities SET disabled_at = NULL, auth_not_before = ? WHERE id = ?').bind(now - 60, first.user_id).run();
		expect((await run(await input('/session', 'POST'))).status).toBe(401);
		const fresh = await input('/session', 'POST');
		fresh.headers.set('Authorization', `Bearer ${await signer.token({ auth_time: unixNow() })}`);
		expect((await run(fresh)).status).toBe(200);
		expect(await countIdentities()).toBe(1);
		expect(await env.WALLET_DB.prepare('SELECT auth_not_before FROM user_identities WHERE id = ?').bind(first.user_id).first('auth_not_before')).toBe(now - 60);
	});
	it('scopes wallet pages to the owner and treats foreign/missing accounts identically', async () => {
		const first = await session(), second = await session('test-user-b');
		const owned = await seedWallet(first), foreign = await seedWallet(second);
		const response = await run(await input('/wallets'));
		const result = await response.json<{ data: { id: string }[]; next_cursor: null }>();
		expect(result.data.map((value) => value.id)).toEqual([owned]);
		expect(result.next_cursor).toBeNull();
		for (const id of [foreign, createResourceId('wallet')]) {
			const response = await run(await input(`/wallets/${id}/accounts`));
			expect(response.status).toBe(404); expect(await response.json()).toEqual({ error_code: 'NOT_FOUND' });
		}
	});
	it('paginates deterministically and rejects unbounded/ambiguous/cross-resource cursors', async () => {
		const owner = await session();
		const ids = [await seedWallet(owner), await seedWallet(owner), await seedWallet(owner)].sort();
		const first = await (await run(await input('/wallets?limit=2'))).json<{ data: { id: string }[]; next_cursor: string }>();
		expect(first.data.map((value) => value.id)).toEqual(ids.slice(0, 2)); expect(first.next_cursor).toBe(ids[1]);
		const second = await (await run(await input(`/wallets?limit=2&after=${first.next_cursor}`))).json<{ data: { id: string }[]; next_cursor: null }>();
		expect(second.data.map((value) => value.id)).toEqual(ids.slice(2)); expect(second.next_cursor).toBeNull();
		for (const query of ['limit=0', 'limit=51', 'limit=-1', 'limit=2&limit=3', 'after=', `after=${createResourceId('party')}`, 'uid=victim', 'rpc=https://evil.test']) {
			expect((await run(await input(`/wallets?${query}`))).status).toBe(400);
		}
	});
	it('returns chain resource projections without an unverified deposit address or signing readiness', async () => {
		const seeded = await seedAccount(await session());
		const result = await (await run(await input(`/wallets/${seeded.walletId}/accounts`))).json<{ data: unknown[] }>();
		expect(result.data).toEqual([{ id: seeded.accountId, wallet_id: seeded.walletId, account_identity_id: seeded.identityId,
			network_id: 'eip155:84532', generation: 3, deployment_state: 'active', spend_readiness: 'not_assessed', receive_enabled: false }]);
	});
	it('enforces same-address instances, generation 3 and wallet-identity compound foreign keys in D1', async () => {
		const owner = await session(), seeded = await seedAccount(owner), otherWallet = await seedWallet(owner);
		await expect(env.WALLET_DB.prepare(`INSERT INTO wallet_accounts (id, wallet_id, account_identity_id, network_id, created_at)
			VALUES (?, ?, ?, 'eip155:84532', ?)`).bind(createResourceId('walletAccount'), otherWallet, seeded.identityId, now).run()).rejects.toThrow();
		await expect(env.WALLET_DB.prepare(`INSERT INTO account_instances
			(account_identity_id, network_id, address, generation, deployment_manifest_sha256, deployment_state, created_at)
			VALUES (?, 'eip155:43113', ?, 3, ?, 'active', ?)`).bind(seeded.identityId, `0x${'1'.repeat(40)}`, seeded.scenario.input.expectedDigest, now).run()).rejects.toThrow();
		await expect(env.WALLET_DB.prepare('UPDATE account_instances SET generation = 2').run()).rejects.toThrow();
		await expect(env.WALLET_DB.prepare("UPDATE account_instances SET network_id = 'eip155:01'").run()).rejects.toThrow();
	});
	it('fails closed on corrupt resource IDs instead of exposing raw database content', async () => {
		const seeded = await seedWallet(await session());
		await env.WALLET_DB.prepare('UPDATE wallets SET id = ? WHERE id = ?').bind(`wal_${'x'.repeat(36)}`, seeded).run();
		const result = await run(await input('/wallets'));
		expect(result.status).toBe(503); expect(await result.json()).toEqual({ error_code: 'WALLET_DATA_INVALID' });
	});
});

describe('V3 authenticated ownership → pinned inspection integration', () => {
	it('returns a public owned context without provider secrets, commitments or monetary permission', async () => {
		const seeded = await seedAccount(await session()), scenario = seeded.scenario;
		const request = await input(`/wallets/${seeded.walletId}/accounts/${seeded.accountId}/context`);
		// Prime JWT verification before checking that context resolution makes no RPC calls.
		await verifyConsumerIdentity(request, projectId);
		const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
		const profile = { document: scenario.input.document, digest: scenario.input.expectedDigest,
			finalityPolicy: scenario.pin, finalityEvidence: scenario.source, assetIds: [], assetDisplay: {},
			providers: [{ operatorId: 'private-provider', url: 'https://rpc.example.test/DO_NOT_SERIALIZE' }] };
		const response = await walletReadRoute(request, env, config, [profile]);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ schema_version: 1, wallet_id: seeded.walletId, wallet_account_id: seeded.accountId,
			network_id: scenario.manifest.network_id, account_id: scenario.state.observation.accountId,
			address: scenario.account.toLowerCase(), deployment: { document: profile.document, digest: profile.digest },
			spend_readiness: 'not_assessed', receive_enabled: false, send_enabled: false });
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(fetcher).not.toHaveBeenCalled();
		expect(await env.WALLET_DB.prepare('SELECT deployment_state FROM account_instances').first('deployment_state')).toBe('active');
	});
	it('protects context reads with identity, ownership, method and query boundaries', async () => {
		const seeded = await seedAccount(await session()); await session('test-user-b');
		const path = `/wallets/${seeded.walletId}/accounts/${seeded.accountId}/context`;
		expect((await run(await input(path))).status).toBe(503);
		expect((await run(await input(path, 'GET', 'test-user-b'))).status).toBe(404);
		const anonymous = await input(path); anonymous.headers.delete('Authorization');
		expect((await run(anonymous)).status).toBe(401);
		expect((await run(await input(path, 'POST'))).status).toBe(405);
		for (const query of ['address=0x1', 'digest=0x1', 'rpc=https://example.test', 'limit=1']) {
			expect((await run(await input(`${path}?${query}`))).status).toBe(400);
		}
		expect((await exports.default.fetch(await input(path))).status).toBe(503);
	});
	it.each(['missing', 'duplicate', 'tampered', 'wrong-address', 'archive', 'disabled'] as const)('rejects unusable account context (%s)', async fault => {
		const seeded = await seedAccount(await session(), fault === 'wrong-address' ? `0x${'ab'.repeat(20)}` : undefined), scenario = seeded.scenario;
		const profile = { document: scenario.input.document, digest: scenario.input.expectedDigest,
			finalityPolicy: scenario.pin, finalityEvidence: scenario.source, assetIds: [], assetDisplay: {}, providers: [] };
		if (fault === 'tampered') profile.document += ' ';
		if (fault === 'archive') await env.WALLET_DB.prepare("UPDATE wallets SET status = 'archived'").run();
		if (fault === 'disabled') await env.WALLET_DB.prepare('UPDATE user_identities SET disabled_at = ?').bind(now).run();
		const response = await walletReadRoute(await input(`/wallets/${seeded.walletId}/accounts/${seeded.accountId}/context`), env, config,
			fault === 'missing' ? [] : fault === 'duplicate' ? [profile, profile] : [profile]);
		expect(response.status).toBe(fault === 'disabled' ? 401 : 503);
		const body = await response.json();
		expect(body).not.toHaveProperty('account_id'); expect(body).not.toHaveProperty('deployment');
	});
	it('exposes balance reads only to the owner and fails closed without server admission', async () => {
		const seeded = await seedAccount(await session()); await session('test-user-b');
		const path = `/wallets/${seeded.walletId}/accounts/${seeded.accountId}/balances`;
		const response = await run(await input(path));
		expect(response.status).toBe(503); expect(await response.json()).toEqual({ error_code: 'SERVICE_UNAVAILABLE' });
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect((await run(await input(path, 'GET', 'test-user-b'))).status).toBe(404);
		const missingAuth = await input(path); missingAuth.headers.delete('Authorization');
		expect((await run(missingAuth)).status).toBe(401);
		expect((await run(await input(path, 'POST'))).status).toBe(405);
		for (const query of ['address=0x1', 'rpc=https://example.test', 'block=100', 'limit=1']) {
			expect((await run(await input(`${path}?${query}`))).status).toBe(400);
		}
		expect((await exports.default.fetch(await input(path))).status).toBe(503);
	});
	it.each(['none', 'disable', 'archive'])('returns balance only while ownership remains valid through HTTP (%s)', async (change) => {
		const seeded = await seedAccount(await session()), scenario = seeded.scenario;
		const request = await input(`/wallets/${seeded.walletId}/accounts/${seeded.accountId}/balances`);
		const profiles = [{ document: scenario.input.document, digest: scenario.input.expectedDigest,
			finalityPolicy: scenario.pin, finalityEvidence: scenario.source, assetIds: ['eip155:84532/slip44:60'],
			assetDisplay: { 'eip155:84532/slip44:60': { symbol: 'ETH', decimals: 18 } },
			providers: [{ operatorId: 'provider-a', url: 'https://a.example/rpc' }, { operatorId: 'provider-b', url: 'https://b.example/rpc' }] }];
		let changed = false;
		vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			if (!changed) {
				changed = true;
				if (change === 'disable') await env.WALLET_DB.prepare('UPDATE user_identities SET disabled_at = ?').bind(now).run();
				if (change === 'archive') await env.WALLET_DB.prepare("UPDATE wallets SET status = 'archived'").run();
			}
			const body = JSON.parse(String(init?.body)) as { id: number; method: string; params?: readonly unknown[] };
			return Response.json({ jsonrpc: '2.0', id: body.id, result: body.method === 'eth_getBalance' ? '0x123' : await scenario.request(body) });
		}));
		const response = await walletReadRoute(request, env, config, profiles);
		if (change !== 'none') {
			expect(response.status).toBe(change === 'disable' ? 401 : 503);
			expect(await response.json()).toEqual({ error_code: change === 'disable' ? 'UNAUTHENTICATED' : 'WALLET_DATA_INVALID' });
			return;
		}
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ wallet_id: seeded.walletId, wallet_account_id: seeded.accountId,
			balances: [{ amount_atomic: '291' }], finality: 'finalized', available_balance: 'not_assessed', spend_readiness: 'not_assessed' });
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await env.WALLET_DB.prepare('SELECT deployment_state FROM account_instances').first('deployment_state')).toBe('active');
	});
	it('inspects only the owned resource and never mutates its deployment state', async () => {
		const seeded = await seedAccount(await session());
		const repo = await repository();
		const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as { id: number; method: string; params?: readonly unknown[] };
			return Response.json({ jsonrpc: '2.0', id: body.id, result: await seeded.scenario.request(body) });
		});
		vi.stubGlobal('fetch', fetchMock);
		const result = await inspectOwnedWalletAccount(repo, seeded.walletId, seeded.accountId, [{ document: seeded.scenario.input.document,
			digest: seeded.scenario.input.expectedDigest, finalityPolicy: seeded.scenario.pin, finalityEvidence: seeded.scenario.source,
			rpcUrls: ['https://rpc.example.test', 'https://second.example.test'] }], new AbortController().signal);
		expect(result).toMatchObject({ wallet_id: seeded.walletId, wallet_account_id: seeded.accountId, status: 'recognized', spend_readiness: 'not_assessed' });
		expect(result).toMatchObject({ providers_agree: true, security: { phase: 'active_policy', policy: seeded.scenario.policy } });
		expect(result).toMatchObject({ finality: 'finalized', security_expires_at: seeded.scenario.source.expires_at });
		expect(fetchMock).toHaveBeenCalledTimes(48);
		expect(await env.WALLET_DB.prepare('SELECT deployment_state FROM account_instances').first('deployment_state')).toBe('active');
	});
	it.each(['disable', 'archive', 'pin'])('rechecks ownership and identity after RPC (%s)', async (change) => {
		const owner = await session(), seeded = await seedAccount(owner), repo = await repository();
		let changed = false;
		vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			if (!changed) {
				changed = true;
				if (change === 'disable') await env.WALLET_DB.prepare('UPDATE user_identities SET disabled_at = ?').bind(now).run();
				if (change === 'archive') await env.WALLET_DB.prepare("UPDATE wallets SET status = 'archived'").run();
				if (change === 'pin') await env.WALLET_DB.prepare('UPDATE account_instances SET deployment_manifest_sha256 = ?').bind(`0x${'f'.repeat(64)}`).run();
			}
			const body = JSON.parse(String(init?.body));
			return Response.json({ jsonrpc: '2.0', id: body.id, result: await seeded.scenario.request(body) });
		}));
		await expect(inspectOwnedWalletAccount(repo, seeded.walletId, seeded.accountId, [{ document: seeded.scenario.input.document,
			digest: seeded.scenario.input.expectedDigest, finalityPolicy: seeded.scenario.pin, finalityEvidence: seeded.scenario.source,
			rpcUrls: seeded.scenario.input.rpcUrls }], new AbortController().signal)).rejects.toMatchObject({
			code: change === 'disable' ? 'UNAUTHENTICATED' : 'WALLET_DATA_INVALID',
		});
	});
	it('does not reuse a verified identity after its token expires', async () => {
		const seeded = await seedAccount(await session()), repo = await repository();
		vi.spyOn(Date, 'now').mockReturnValue((unixNow() + 7200) * 1000);
		await expect(repo.ownedAccount(seeded.walletId, seeded.accountId)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
	});
	it('blocks foreign, missing and cross-wallet resources before calling RPC or selecting a profile', async () => {
		const seeded = await seedAccount(await session());
		await session('test-user-b'); const repo = await repository('test-user-b');
		const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
		await expect(inspectOwnedWalletAccount(repo, seeded.walletId, seeded.accountId, [], new AbortController().signal)).rejects.toMatchObject({ code: 'NOT_FOUND' });
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it('does not use a database pin as admission or turn a missing profile into activation', async () => {
		const seeded = await seedAccount(await session()); const repo = await repository();
		const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
		await expect(inspectOwnedWalletAccount(repo, seeded.walletId, seeded.accountId, [], new AbortController().signal)).rejects.toThrow('INSPECTION_PROFILE_UNAVAILABLE');
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it('rejects inconsistent cryptographic identity before RPC', async () => {
		const seeded = await seedAccount(await session()); const repo = await repository();
		await env.WALLET_DB.prepare('UPDATE account_identities SET user_salt_commitment = ?').bind(`0x${'d'.repeat(64)}`).run();
		const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
		await expect(inspectOwnedWalletAccount(repo, seeded.walletId, seeded.accountId, [], new AbortController().signal)).rejects.toMatchObject({ code: 'WALLET_DATA_INVALID' });
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it('a disable committed after JWT verification is still enforced by the ownership query', async () => {
		const owner = await session(), seeded = await seedAccount(owner), repo = await repository();
		await env.WALLET_DB.prepare('UPDATE user_identities SET disabled_at = ? WHERE id = ?').bind(now, owner.user_id).run();
		const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
		await expect(inspectOwnedWalletAccount(repo, seeded.walletId, seeded.accountId, [], new AbortController().signal)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
