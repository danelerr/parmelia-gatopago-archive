import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ActivationStatusRepository } from '../../src/v3/wallets/activationStatus';
import { WalletRepository } from '../../src/v3/wallets/repository';
import { parseActivationStatus } from '../../../shared/v3/activationStatus';
import { createResourceId } from '../../../shared/v3/primitives';
import { activationScenario } from './activation.fixture';
import { activationCommitScenario } from './activationCommit.fixture';
import { activationObservationScenario, cleanActivationObservations } from './activationObservation.fixture';
import { activationProjectionScenario } from './activationProjection.fixture';
import { deliveryIdentity } from './creationDelivery.fixture';

beforeAll(async () => { await applyD1Migrations(env.WALLET_DB, env.V3_TEST_MIGRATIONS); });
beforeEach(cleanActivationObservations);
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await cleanActivationObservations(); });
type Scenario = Awaited<ReturnType<typeof activationScenario>>;
const repo = (f: Pick<Scenario, 'principal' | 'configuration'>, identity = f.principal) =>
 new ActivationStatusRepository(env.WALLET_DB, identity, f.configuration.scope, f.configuration.profiles);
const snapshot = async () => {
 const tables = ['account_activations','account_activation_commits','account_activation_outbox','account_activation_transactions',
  'account_activation_jobs','account_activation_observations','account_activation_observation_jobs','account_activation_projections'];
 return Promise.all(tables.map(async (table) => (await env.WALLET_DB.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results));
};
describe('Owned activation status: actual local D1/crypto, no RPC or mutations on read', { timeout: 20_000 }, () => {
 it('reports a prepared consent without creating an outbox or waking work', async () => {
  const f = await activationScenario(), r = f.request(); await f.repository().prepare(r, new AbortController().signal);
  const before = await snapshot(); f.fetch.mockClear();
  expect(await repo(f).read(r.id)).toMatchObject({ consent_state: 'prepared', delivery_state: 'not_requested', job_state: 'not_requested',
   observation: null, policy_confirmation: null, transaction_hash: null, account_readiness: 'not_assessed' });
  expect(await snapshot()).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
 });
 it('reports authorized pending delivery without claiming chain success', async () => {
  const f = await activationCommitScenario(), before = await snapshot(); f.fetch.mockClear();
  expect(await repo(f).read(f.request.id)).toMatchObject({ consent_state: 'authorized', delivery_state: 'pending', job_state: 'ready',
   observation: null, policy_confirmation: null, transaction_hash: null });
  expect(await snapshot()).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
 });
 it.each(['prepare','commit'] as const)('returns only sanitized %s observations, without raw execution or proofs', async (kind) => {
  const f = await activationObservationScenario(kind); await f.run(); const before = await snapshot(); f.fetch.mockClear();
  const result = await repo(f).read(f.request.id, kind === 'commit' ? f.id : undefined);
  expect(result).toMatchObject({ delivery_state: 'uncertain', transaction_hash: f.grant.transactionHash,
   observation: { status: 'observed', finality: 'finalized', outcome: kind === 'commit' ? 'activation_committed' : 'proposal_prepared' },
   policy_confirmation: null, account_readiness: 'not_assessed' });
  for (const key of ['serialized_transaction','authorization_json','assertion_body','lease_token','rpcUrls','privateKey','signatureDER','input']) {
   expect(JSON.stringify(result)).not.toContain(key);
  }
  expect(await snapshot()).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
 });
 it('shows installed policy history separately from current readiness and does not renew its expiry', async () => {
  const f = await activationProjectionScenario(); expect(await f.project()).toBe('projected');
  const before = await snapshot(); f.fetch.mockClear();
  const first = await repo(f).read(f.request.id, f.id);
  expect(first.policy_confirmation).toMatchObject({ manifest_hash: f.grant.signed.expectedManifestHash, source_epoch: 1 });
  const clock = vi.spyOn(Date, 'now').mockReturnValue((first.policy_confirmation!.evidence_expires_at + 1) * 1000);
  const later = await repo(f).read(f.request.id, f.id); clock.mockRestore();
  expect(later.policy_confirmation).toEqual(first.policy_confirmation); expect(later.account_readiness).toBe('not_assessed');
  expect(await snapshot()).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
 });
 it('keeps the newest uncertain observation alongside, not replaced by, confirmed history', async () => {
  const f = await activationProjectionScenario(); await f.project();
  await env.WALLET_DB.prepare('UPDATE account_activation_observation_jobs SET next_poll_at = 0 WHERE operation_id = ?').bind(f.id).run();
  const claim = await f.journal().claim(f.id); expect(claim).not.toBeNull();
  await f.journal().append(claim!, { status: 'unavailable', transaction_hash: f.grant.transactionHash,
   provider_ids: ['provider-one','provider-two'], finality: 'not_assessed', account_readiness: 'not_assessed' });
  f.fetch.mockClear(); const result = await repo(f).read(f.request.id, f.id);
  expect(result.observation).toMatchObject({ epoch: 2, status: 'unavailable', finality: 'not_assessed', outcome: null });
  expect(result.policy_confirmation).not.toBeNull(); expect(f.fetch).not.toHaveBeenCalled();
 });
 it('hides another owner and an incorrect nested activation, even for the same user', async () => {
  const f = await activationObservationScenario('commit'), other = deliveryIdentity('status-other');
  await new WalletRepository(env.WALLET_DB, other).ensureSession(); f.fetch.mockClear();
  await expect(repo(f, other).read(f.request.id, f.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(repo(f).read(createResourceId('operation'), f.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.fetch).not.toHaveBeenCalled();
 });
 it('does not disclose historical observations to a revoked session', async () => {
  const f = await activationObservationScenario(); await f.run();
  await env.WALLET_DB.prepare('UPDATE user_identities SET auth_not_before = ? WHERE firebase_subject = ?')
   .bind(f.principal.authTime + 1, f.principal.subject).run(); f.fetch.mockClear();
  await expect(repo(f).read(f.request.id)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(f.fetch).not.toHaveBeenCalled();
 });
 it('rejects a missing current observation instead of falling back to history', async () => {
  const f = await activationProjectionScenario(); await f.project();
  await env.WALLET_DB.prepare('UPDATE account_activation_observation_jobs SET lease_epoch = 999, latest_epoch = 999 WHERE operation_id = ?').bind(f.id).run();
  await expect(repo(f).read(f.request.id, f.id)).rejects.toThrow();
 });
 it.each(['account_readiness','operation_id','proposal_hash','extra'])('rejects public %s substitution', async (field) => {
  const f = await activationCommitScenario(), good = await repo(f).read(f.request.id);
  const bad = { ...good, [field]: field === 'operation_id' ? createResourceId('operation') : 'unsupported' };
  expect(() => parseActivationStatus(bad, { activationId: f.request.id, operationId: f.request.id, kind: 'prepare', proposalHash: good.proposal_hash })).toThrow();
 });
});
