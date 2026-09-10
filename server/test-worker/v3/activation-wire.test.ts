import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseActivationPreview, parseActivationReceipt, parseActivationCommitPreview, parseActivationCommitReceipt } from '../../../shared/v3/activationWire';
import { createResourceId } from '../../../shared/v3/primitives';
import { InitializationRepository } from '../../src/v3/wallets/initialization';
import { activationScenario } from './activation.fixture';
import { activationCommitScenario } from './activationCommit.fixture';
import { cleanCreationDelivery } from './creationDelivery.fixture';

type Scenario = Awaited<ReturnType<typeof activationScenario>>;
async function selection(f: Pick<Scenario, 'principal' | 'configuration' | 'id' | 'credentialRef' | 'f'>, r: ReturnType<Scenario['request']>) {
 const initializations = new InitializationRepository(env.WALLET_DB, f.principal, f.configuration.scope, f.configuration.profiles);
 const preparation = await initializations.readPreparation(f.id);
 return { activationId: r.id, walletId: r.walletId, walletAccountId: r.walletAccountId, nextPolicy: r.nextPolicy,
  proposalValidUntil: r.proposalValidUntil, consent: { preparation,
   expected: { id: f.id, credentialRef: f.credentialRef, document: f.configuration.profiles[0].document,
    profileDigest: f.configuration.profiles[0].digest, userSaltCommitment: f.f.input.userSaltCommitment, scope: f.configuration.scope } } };
}
const signal = () => new AbortController().signal;
async function json(value: object) { return Response.json(value).json(); }
async function clean() {
 await env.WALLET_DB.exec('DELETE FROM account_activation_transactions; DELETE FROM account_activation_outbox; DELETE FROM account_activation_commits; DELETE FROM account_activations;');
 await cleanCreationDelivery();
}
beforeAll(async () => { await applyD1Migrations(env.WALLET_DB, env.V3_TEST_MIGRATIONS); });
beforeEach(clean);
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await clean(); });

describe('Web activation decoder against real D1 repository responses (synthetic RPC)', () => {
 it('rebuilds actual prepare/read/authorization receipts without trusting returned configuration', async () => {
  const f = await activationScenario(), r = f.request(), chosen = await selection(f, r);
  const prepared = await f.repository().prepare(r, signal()), raw = await json(prepared);
  const review = parseActivationPreview(raw, chosen);
  expect(review.compiled.digest).toBe(prepared.proposal_hash);
  expect(review.compiled.initial.account).toBe(f.prepared.account);
  const receipt = await f.repository().authorize(r.id, f.f.assertion(review.compiled.digest), await f.proofs(review.input), signal());
  expect(parseActivationReceipt(await json(receipt), chosen, raw)).toEqual(receipt);
  f.fetch.mockClear();
  const restored = await json(await f.repository().read(r.id));
  expect(parseActivationPreview(restored, chosen).receipt.state).toBe('authorized');
  expect(f.fetch).not.toHaveBeenCalled();
  expect(new TextEncoder().encode(JSON.stringify(restored)).length).toBeLessThan(32768);
 });
 it('rebuilds a separate pending-proposal checkpoint and validates actual commit receipts', async () => {
  const f = await activationCommitScenario(), chosen = await selection(f, f.request), id = createResourceId('operation');
  const parent = await json(await f.repository().read(f.request.id));
  const prepared = await f.repository().prepareCommit(id, f.request.id, signal()), raw = await json(prepared);
  const review = parseActivationCommitPreview(raw, chosen, parent, id);
  expect(review.compiled.digest).toBe(prepared.commit_digest);
  const receipt = await f.repository().authorizeCommit(id, f.f.assertion(review.compiled.digest), signal());
  expect(parseActivationCommitReceipt(await json(receipt), chosen, parent, raw, id)).toEqual(receipt);
  expect(receipt.receive_enabled).toBe(false); expect(receipt.spend_enabled).toBe(false);
  f.fetch.mockClear();
  const restored = await json(await f.repository().readCommit(id));
  expect(parseActivationCommitPreview(restored, chosen, parent, id).receipt.state).toBe('authorized');
  expect(f.fetch).not.toHaveBeenCalled();
  expect(new TextEncoder().encode(JSON.stringify(restored)).length).toBeLessThan(32768);
 });
});
