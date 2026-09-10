import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '../../../shared/v3/primitives';
import { processActivationProjection } from '../../src/v3/wallets/processActivationProjection';
import { createActivationProcessor } from '../../src/v3/wallets/processActivationJob';
import { activationProjectionScenario } from './activationProjection.fixture';
import { activationObservationScenario, cleanActivationObservations } from './activationObservation.fixture';
import { deliveryNow } from './creationDelivery.fixture';
import { fixtureHash } from '../../test/fixtures/v3Inspection';

beforeAll(async () => { await applyD1Migrations(env.WALLET_DB, env.V3_TEST_MIGRATIONS); });
beforeEach(cleanActivationObservations);
afterEach(async () => { vi.restoreAllMocks(); await env.WALLET_DB.exec('DROP TRIGGER IF EXISTS activation_projection_fail'); await cleanActivationObservations(); });
const signal = () => new AbortController().signal;
const row = (id: string) => env.WALLET_DB.prepare('SELECT * FROM account_activation_projections WHERE operation_id = ?').bind(id).first();

describe('installed activation policy projection', { timeout: 25_000 }, () => {
 it('matches the signed policy and persists historical evidence without granting spending', async () => {
  const f = await activationProjectionScenario(); expect(await f.project()).toBe('projected');
  expect(await row(f.id)).toMatchObject({ activation_id: f.grant.activationId, transaction_hash: f.grant.transactionHash, manifest_hash: f.grant.signed.expectedManifestHash });
  expect((await f.repository().read(f.grant.activationId)).spend_enabled).toBe(false);
  expect(f.reply.mock.calls.some(([m]) => m === 'eth_sendRawTransaction')).toBe(false);
 });
 it('the durable processor only finishes a commit after policy projection', async () => {
  const f = await activationProjectionScenario(), processor = createActivationProcessor(f.configuration);
  expect(await processor.run(env.WALLET_DB, f.id, signal())).toEqual({ state: 'observed', reason: 'commit_finalized' });
  expect(await row(f.id)).not.toBeNull();
 });
 it.each(['manifest','policy','scope','version','admin_nonce','recovery'] as const)('rejects changed %s despite a valid commit receipt', async (field) => {
  const f = await activationProjectionScenario();
  if (field === 'manifest') f.active.manifest = fixtureHash('b');
  if (field === 'policy') f.active.policy = { ...f.active.policy, recoveryDelaySeconds: f.active.policy.recoveryDelaySeconds + 1 };
  if (field === 'scope') f.active.scope = fixtureHash('b');
  if (field === 'version') f.active.version = 3n;
  if (field === 'admin_nonce') f.active.adminNonce = 1n;
  if (field === 'recovery') f.active.pending = true;
  await expect(f.project()).rejects.toThrow(); expect(await row(f.id)).toBeNull();
 });
 it('retains history across expiry but never renews its evidence or does RPC on replay', async () => {
  const f = await activationProjectionScenario(); await f.project(); const before = await row(f.id);
  f.fetch.mockClear(); vi.spyOn(Date, 'now').mockReturnValue((deliveryNow() + 3600) * 1000);
  expect(await f.project()).toBe('already_projected'); expect(await row(f.id)).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
 });
 it('does not project stale receipt finality', async () => {
  const f = await activationProjectionScenario(); f.fetch.mockClear();
  vi.spyOn(Date, 'now').mockReturnValue((deliveryNow() + 31) * 1000);
  expect(await f.project()).toBe('pending'); expect(await row(f.id)).toBeNull(); expect(f.fetch).not.toHaveBeenCalled();
 });
 it('rejects unavailable fresh policy even with an earlier finalized receipt', async () => {
  const f = await activationProjectionScenario(); f.fetch.mockRejectedValue(new Error('synthetic provider unavailable'));
  await expect(f.project()).rejects.toThrow(); expect(await row(f.id)).toBeNull();
 });
 it('a changed observation lease during inspection prevents persistence', async () => {
  const f = await activationProjectionScenario(), original = f.configuration.finality;
  const configuration = { ...f.configuration, finality: async (...args: Parameters<typeof original>) => {
   const evidence = await original(...args);
   await env.WALLET_DB.prepare(`UPDATE account_activation_observation_jobs SET lease_token = ?,lease_started_at = ?,lease_expires_at = ? WHERE operation_id = ?`)
    .bind(createResourceId('operation'), deliveryNow(), deliveryNow() + 60, f.id).run();
   return evidence;
  } };
  expect(await processActivationProjection(env.WALLET_DB, f.id, configuration, signal())).toBe('superseded');
  expect(await row(f.id)).toBeNull();
 });
 it('an insert failure cannot leave partial projection and can be retried', async () => {
  const f = await activationProjectionScenario();
  await env.WALLET_DB.exec(`CREATE TRIGGER activation_projection_fail BEFORE INSERT ON account_activation_projections BEGIN SELECT RAISE(ABORT,'synthetic projection failure'); END;`);
  await expect(f.project()).rejects.toThrow(); expect(await row(f.id)).toBeNull();
  await env.WALLET_DB.exec('DROP TRIGGER activation_projection_fail'); expect(await f.project()).toBe('projected');
 });
 it('concurrent projectors record one immutable result', async () => {
  const f = await activationProjectionScenario(); const results = await Promise.all([f.project(), f.project()]);
  expect(results.filter((x) => x === 'projected')).toHaveLength(1);
  expect(await env.WALLET_DB.prepare('SELECT count(*) AS n FROM account_activation_projections').first('n')).toBe(1);
  await expect(env.WALLET_DB.prepare('UPDATE account_activation_projections SET manifest_hash = ?').bind(fixtureHash('b')).run()).rejects.toThrow();
 });
 it('revocation after a completed send does not erase its policy result', async () => {
  const f = await activationProjectionScenario(); await env.WALLET_DB.prepare('UPDATE user_identities SET disabled_at = ?').bind(deliveryNow()).run();
  expect(await f.project()).toBe('projected');
 });
 it('prepare alone is never projected as active', async () => {
  const f = await activationObservationScenario(); await f.run();
  expect(await processActivationProjection(env.WALLET_DB, f.id, { ...f.configuration, finality: async () => { throw new Error('must not inspect'); } }, signal())).toBe('pending');
 });
 it('an aborted invocation cannot project anything', async () => {
  const f = await activationProjectionScenario(); f.fetch.mockClear();
  await expect(f.project(AbortSignal.abort())).rejects.toThrow(); expect(await row(f.id)).toBeNull(); expect(f.fetch).not.toHaveBeenCalled();
 });
 it('a regressed current checkpoint cannot confirm a newer commit', async () => {
  const f = await activationProjectionScenario(), original = f.configuration.finality;
  const configuration = { ...f.configuration, finality: async (...args: Parameters<typeof original>) => {
   const evidence = await original(...args), checkpoint = { ...f.blocks.get(101)! };
   return { ...evidence, target: checkpoint, checkpoint };
  } };
  await expect(processActivationProjection(env.WALLET_DB, f.id, configuration, signal())).rejects.toThrow();
  expect(await row(f.id)).toBeNull();
 });
 it('does not accept observation evidence from a different admitted provider set', async () => {
  const f = await activationProjectionScenario(); f.fetch.mockClear();
  const configuration = { ...f.configuration, networks: f.configuration.networks.map((n) => ({ ...n,
   providers: n.providers.map((p, i) => ({ ...p, operatorId: `replacement-${i}` })) })) };
  await expect(processActivationProjection(env.WALLET_DB, f.id, configuration, signal())).rejects.toThrow();
  expect(await row(f.id)).toBeNull(); expect(f.fetch).not.toHaveBeenCalled();
 });
});
