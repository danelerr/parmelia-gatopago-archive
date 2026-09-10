import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { parseActivationPreview } from '@gatopago/shared/v3/activation-wire';
import { ActivationFlow } from '../src/wallet/activation-flow';
import { isReloadBlocked } from '../src/pwa/reload-guard';
import { activationError as error, activationFlowFixture as fixture } from './activation-flow.fixture';

const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
beforeEach(() => { vi.stubGlobal('window', {}); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Component-owned activation: explicit consent, real local P256/EIP712, no onchain readiness claim', () => {
  it('checks progress explicitly without more signatures and clears it on failed refresh', async () => {
    const f = fixture(); await f.flow.checkProgress(); expect(f.session.status).not.toHaveBeenCalled();
    await f.flow.prepare(); await f.confirmAll(); await f.flow.authorize(); const count = f.prove.mock.calls.length;
    const context = f.flow.commitContext()!;
    f.session.status.mockResolvedValueOnce({ schema_version: 1, activation_id: context.choice.activationId, operation_id: context.choice.activationId,
      kind: 'prepare', proposal_hash: context.parent.wire.proposal_hash, consent_state: 'authorized', delivery_state: 'pending', transaction_hash: null,
      job_state: 'ready', reason: null, observation: null, policy_confirmation: null, account_readiness: 'not_assessed', snapshot_at: f.t.f.input.validAfter });
    await f.flow.checkProgress(); expect(f.flow.snapshot().progress?.delivery_state).toBe('pending');
    expect(f.prove).toHaveBeenCalledTimes(count); expect(f.session.authorize).toHaveBeenCalledTimes(1);
    f.session.status.mockRejectedValueOnce(new Error('unavailable')); await f.flow.checkProgress();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'authorized', progress: null, error: 'activation/status-unavailable' }); f.flow.dispose();
  });
  it('hands the final step only a verified authorized parent without retaining first-step proofs', async () => {
    const f = fixture(); expect(f.flow.commitContext()).toBeNull(); await f.flow.prepare(); expect(f.flow.commitContext()).toBeNull();
    await f.confirmAll(); await f.flow.authorize(); const context = f.flow.commitContext()!;
    expect(parseActivationPreview(context.parent.wire, context.choice).receipt.state).toBe('authorized');
    expect(JSON.stringify(context)).not.toContain('authenticator_data');
    Object.assign(context.parent.wire, { state: 'prepared' });
    expect(f.flow.commitContext()!.parent.wire.state).toBe('authorized'); f.flow.dispose();
  });
  it('does nothing at construction, confirmation without preparation, or disposal', async () => {
    const f = fixture(); const uuid = vi.spyOn(crypto, 'randomUUID');
    const flow = f.newFlow(); await flow.confirmOwner(); await flow.confirmInitialRole(); await flow.authorize();
    expect(flow.externalRequest(0)).toBeNull(); flow.dispose();
    expect(uuid).not.toHaveBeenCalled(); expect(f.capture).not.toHaveBeenCalled(); expect(f.prove).not.toHaveBeenCalled();
    expect(f.session.prepare).not.toHaveBeenCalled(); expect(isReloadBlocked()).toBe(false);
  });
  it('prepares only on explicit action and freezes the selected account, policy, ID and deadline', async () => {
    const f = fixture(), original = [...f.addresses]; f.addresses.reverse();
    await f.flow.prepare(); const state = f.flow.snapshot(), selected = f.session.prepare.mock.calls[0][0];
    expect(state.phase).toBe('ready'); expect(state.guardians).toHaveLength(3);
    expect(state.guardians.find((g) => g.roles === 6)!.address).toBe(original[0].toLowerCase());
    expect(selected.walletId).toBe(f.bootstrap.wallet_id); expect(selected.proposalValidUntil).toBe(f.t.f.input.validAfter + 86400);
    expect(state.receipt).toMatchObject({ receive_enabled: false, spend_enabled: false, activation_assessment: 'not_assessed' });
    await f.flow.prepare(); expect(f.session.prepare).toHaveBeenCalledTimes(1); expect(f.prove).not.toHaveBeenCalled();
    f.flow.dispose();
  });
  it('uses two distinct explicit passkey gestures and three typed guardian proofs before a separate authorization action', async () => {
    const f = fixture(); await f.flow.prepare();
    const ownerAction = f.flow.confirmOwner(); expect(f.prove).toHaveBeenCalledTimes(1); await ownerAction;
    expect(f.session.authorize).not.toHaveBeenCalled(); expect(f.capture).toHaveBeenCalledTimes(1);
    const roleAction = f.flow.confirmInitialRole(); expect(f.prove).toHaveBeenCalledTimes(2); await roleAction;
    expect(f.prove.mock.calls[0][0].challenge).not.toBe(f.prove.mock.calls[1][0].challenge);
    for (const guardian of f.flow.snapshot().guardians) await f.flow.importExternal(guardian.index, await f.external(guardian.index));
    const state = f.flow.snapshot(); expect(state.guardians.every((g) => g.confirmed)).toBe(true);
    expect(state.ownerConfirmed && state.initialRoleConfirmed).toBe(true);
    expect(JSON.stringify(state)).not.toContain('authenticator_data'); expect(JSON.stringify(state)).not.toContain('signature');
    expect(f.session.authorize).not.toHaveBeenCalled(); await f.flow.authorize();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'authorized', ownerConfirmed: false, initialRoleConfirmed: false, submitted: false,
      receipt: { state: 'authorized', activation_assessment: 'not_assessed', receive_enabled: false, spend_enabled: false } });
    expect(f.session.authorize.mock.calls[0][3]).toHaveLength(4);
    expect(f.session.prepareCommit).not.toHaveBeenCalled(); expect(isReloadBlocked()).toBe(false); f.flow.dispose();
  });
  it('cannot submit incomplete consents or reuse the owner proof as the changed-role proof', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirmOwner(); await f.flow.authorize();
    expect(f.session.authorize).not.toHaveBeenCalled();
    const owner = await f.prove(f.prove.mock.calls[0][0]); f.prove.mockResolvedValueOnce(owner);
    await f.flow.confirmInitialRole(); expect(f.flow.snapshot().initialRoleConfirmed).toBe(false);
    expect(f.session.authorize).not.toHaveBeenCalled(); f.flow.dispose();
  });
  it('cancellation does not start recovery, remove a key, submit or launch a second ceremony', async () => {
    const f = fixture(); await f.flow.prepare(); f.prove.mockRejectedValueOnce(error('cancelled'));
    await f.flow.confirmOwner(); expect(f.flow.snapshot()).toMatchObject({ phase: 'ready', error: 'cancelled', ownerConfirmed: false });
    expect(f.prove).toHaveBeenCalledTimes(1); expect(f.session.authorize).not.toHaveBeenCalled(); f.flow.dispose();
  });
  it('invalid guardian imports remain local, are not labelled an uncertain submission, and can be corrected', async () => {
    const f = fixture(); await f.flow.prepare(); const index = f.flow.snapshot().guardians[0].index;
    await f.flow.importExternal(index, '{}'); expect(f.flow.snapshot()).toMatchObject({ phase: 'ready', error: 'activation/invalid-proof', submitted: false });
    expect(f.flow.snapshot().guardians.some((g) => g.confirmed)).toBe(false); expect(f.session.authorize).not.toHaveBeenCalled();
    await f.flow.importExternal(index, await f.external(index)); expect(f.flow.snapshot().guardians.find((g) => g.index === index)!.confirmed).toBe(true);
    f.flow.dispose();
  });
  it('never overwrites an imported factor or accepts a proof tagged as another signer', async () => {
    const f = fixture(); await f.flow.prepare(); const [first, second] = f.flow.snapshot().guardians;
    const text = await f.external(first.index); await f.flow.importExternal(first.index, text); const count = f.session.importExternalProof.mock.calls.length;
    await f.flow.importExternal(first.index, '{}'); expect(f.session.importExternalProof).toHaveBeenCalledTimes(count);
    f.session.importExternalProof.mockResolvedValueOnce({ kind: 'ecdsa', signerIndex: first.index, signature: '0x00' });
    await f.flow.importExternal(second.index, '{}'); expect(f.flow.snapshot().error).toBe('activation/invalid-proof');
    expect(f.flow.snapshot().guardians.find((g) => g.index === second.index)!.confirmed).toBe(false); f.flow.dispose();
  });
  it('deduplicates double clicks and rejects a late proof after session replacement', async () => {
    const f = fixture(); await f.flow.prepare(); const waiting = deferred<Awaited<ReturnType<typeof f.prove>>>();
    f.prove.mockReturnValueOnce(waiting.promise); const action = f.flow.confirmOwner(); await f.flow.confirmOwner();
    expect(f.prove).toHaveBeenCalledTimes(1); f.session.assertCurrent.mockImplementation(() => { throw error('auth/session-changed'); });
    f.flow.checkSession(); await action; waiting.reject(new Error('late')); await Promise.resolve();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'closed', ownerConfirmed: false }); expect(isReloadBlocked()).toBe(false); f.flow.dispose();
  });
  it('does not replace an uncertain preparation and reads before retrying the same missing resource', async () => {
    const f = fixture(); f.session.prepare.mockRejectedValueOnce(error('activation/unavailable')); await f.flow.prepare();
    const locator = f.flow.snapshot().continuation, selected = f.session.prepare.mock.calls[0][0];
    expect(f.flow.snapshot().phase).toBe('uncertain'); await f.flow.prepare(); expect(f.session.prepare).toHaveBeenCalledTimes(1);
    await f.flow.restore(); expect(f.flow.snapshot().phase).toBe('absent'); await f.flow.prepare();
    expect(f.session.prepare.mock.calls[1][0]).toEqual(selected); expect(f.flow.snapshot().continuation).toBe(locator); f.flow.dispose();
  });
  it('restores a successful preparation whose response was lost without POSTing again', async () => {
    const f = fixture(); f.session.prepare.mockImplementationOnce(async (choice) => { await f.prepare(choice); throw error('activation/unavailable'); });
    await f.flow.prepare(); await f.flow.restore(); expect(f.flow.snapshot().phase).toBe('ready');
    expect(f.session.prepare).toHaveBeenCalledTimes(1); expect(f.prove).not.toHaveBeenCalled(); f.flow.dispose();
  });
  it('resumes the same locator after disposal, without retaining signatures or POSTing on restore', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirmOwner(); const locator = f.flow.snapshot().continuation!;
    f.flow.dispose(); const next = f.newFlow(); await next.restore(locator);
    expect(next.snapshot()).toMatchObject({ phase: 'ready', ownerConfirmed: false, initialRoleConfirmed: false });
    expect(f.session.prepare).toHaveBeenCalledTimes(1); expect(f.prove).toHaveBeenCalledTimes(1); next.dispose();
  });
  it('restores historical authorized consent after expiry without asking for any new signature', async () => {
    const f = fixture(); await f.flow.prepare(); await f.confirmAll(); await f.flow.authorize();
    const locator = f.flow.snapshot().continuation!; f.flow.dispose(); await vi.advanceTimersByTimeAsync(400_000);
    const next = f.newFlow(), count = f.prove.mock.calls.length; await next.restore(locator);
    expect(next.snapshot().phase).toBe('authorized'); await next.confirmOwner(); await next.authorize();
    expect(f.prove).toHaveBeenCalledTimes(count); expect(f.session.authorize).toHaveBeenCalledTimes(1); next.dispose();
  });
  it('after an uncertain authorization, forbids new proofs and retries only the identical bytes after GET', async () => {
    const f = fixture(); await f.flow.prepare(); await f.confirmAll();
    f.session.authorize.mockRejectedValueOnce(error('activation/unavailable')); await f.flow.authorize();
    const first = structuredClone(f.session.authorize.mock.calls[0].slice(0, 4)); expect(f.flow.snapshot().phase).toBe('uncertain');
    await f.flow.authorize(); expect(f.session.authorize).toHaveBeenCalledTimes(1);
    await f.flow.restore(); expect(f.flow.snapshot()).toMatchObject({ phase: 'ready', submitted: true });
    const count = f.prove.mock.calls.length; await f.flow.confirmOwner(); await f.flow.confirmInitialRole();
    expect(f.flow.externalRequest(f.flow.snapshot().guardians[0].index)).toBeNull();
    await f.flow.importExternal(0, '{}'); expect(f.prove).toHaveBeenCalledTimes(count);
    await f.flow.authorize(); expect(f.session.authorize.mock.calls[1].slice(0, 4)).toEqual(first);
    expect(f.flow.snapshot().phase).toBe('authorized'); f.flow.dispose();
  });
  it('does not call uncertain submission failed merely because its signing window elapsed', async () => {
    const f = fixture(); await f.flow.prepare(); await f.confirmAll(); f.session.authorize.mockRejectedValueOnce(error('activation/unavailable'));
    await f.flow.authorize(); await f.flow.restore(); await vi.advanceTimersByTimeAsync(301_000);
    expect(f.flow.snapshot()).toMatchObject({ phase: 'uncertain', error: 'activation/result-unknown', submitted: true });
    await f.flow.restore(); expect(f.flow.snapshot().phase).toBe('uncertain');
    f.wire.state = 'authorized'; await f.flow.restore(); expect(f.flow.snapshot().phase).toBe('authorized'); f.flow.dispose();
  });
  it('resolves a lost successful authorization response through GET without resending it', async () => {
    const f = fixture(); await f.flow.prepare(); await f.confirmAll(); const saved = f.session.authorize.getMockImplementation()!;
    f.session.authorize.mockImplementationOnce(async (...args) => { await saved(...args); throw error('activation/unavailable'); });
    await f.flow.authorize(); expect(f.flow.snapshot().phase).toBe('uncertain'); await f.flow.restore();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'authorized', ownerConfirmed: false, submitted: false });
    expect(f.session.authorize).toHaveBeenCalledTimes(1); f.flow.dispose();
  });
  it('expires unsigned/local proofs without a timer-driven request, retry or renewal', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirmOwner(); const count = f.session.prepare.mock.calls.length;
    await vi.advanceTimersByTimeAsync(301_000); expect(f.flow.snapshot()).toMatchObject({ phase: 'expired', ownerConfirmed: false });
    await f.flow.confirmOwner(); await f.flow.authorize(); expect(f.session.prepare).toHaveBeenCalledTimes(count);
    expect(f.session.restore).not.toHaveBeenCalled(); expect(f.session.authorize).not.toHaveBeenCalled(); f.flow.dispose();
  });
  it.each(['preparing', 'proving', 'importing', 'submitting'])('bounds %s waits, drops late completion and releases reload guard', async (phase) => {
    const f = fixture(), waiting = deferred<never>(); let run: Promise<void>;
    if (phase === 'preparing') { f.session.prepare.mockReturnValueOnce(waiting.promise); run = f.flow.prepare(); }
    else {
      await f.flow.prepare();
      if (phase === 'proving') { f.prove.mockReturnValueOnce(waiting.promise); run = f.flow.confirmOwner(); }
      else if (phase === 'importing') { f.session.importExternalProof.mockReturnValueOnce(waiting.promise); run = f.flow.importExternal(f.flow.snapshot().guardians[0].index, '{}'); }
      else { await f.confirmAll(); f.session.authorize.mockReturnValueOnce(waiting.promise); run = f.flow.authorize(); }
    }
    expect(isReloadBlocked()).toBe(true); await vi.advanceTimersByTimeAsync(phase === 'proving' ? 90_001 : 30_001); await run;
    expect(isReloadBlocked()).toBe(false); const snapshot = f.flow.snapshot(); waiting.reject(new Error('late')); await Promise.resolve();
    expect(f.flow.snapshot()).toBe(snapshot); f.flow.dispose();
  });
  it('stopping a local ceremony is not reported as an uncertain HTTP submission', async () => {
    const f = fixture(); await f.flow.prepare(); const waiting = deferred<Awaited<ReturnType<typeof f.prove>>>();
    f.prove.mockReturnValueOnce(waiting.promise); const action = f.flow.confirmOwner(); f.flow.stop(); await action;
    expect(f.flow.snapshot()).toMatchObject({ phase: 'ready', error: 'activation/verification-stopped', submitted: false });
    waiting.reject(new Error('late')); await Promise.resolve(); expect(f.session.authorize).not.toHaveBeenCalled(); f.flow.dispose();
  });
  it('stopping a session capture releases the UI and drops its eventual result', async () => {
    const f = fixture(), waiting = deferred<Awaited<ReturnType<typeof f.capture>>>(); f.capture.mockReturnValueOnce(waiting.promise);
    const action = f.flow.prepare(); f.flow.stop(); await action; expect(isReloadBlocked()).toBe(false);
    waiting.resolve(f.session); await Promise.resolve(); expect(f.session.prepare).not.toHaveBeenCalled(); expect(f.flow.snapshot().phase).toBe('uncertain'); f.flow.dispose();
  });
  it('clears local consents on replacement of the same UID session and cannot resurrect them', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirmOwner(); f.session.assertCurrent.mockImplementation(() => { throw error('auth/session-changed'); });
    f.flow.checkSession(); expect(f.flow.snapshot()).toMatchObject({ phase: 'closed', continuation: null, ownerConfirmed: false, review: null });
    await f.flow.prepare(); await f.flow.restore(); await f.flow.confirmOwner(); expect(f.session.prepare).toHaveBeenCalledTimes(1); f.flow.dispose();
  });
  it('drops a proof finishing after unmount and permits a clean StrictMode re-subscription', async () => {
    const f = fixture(); await f.flow.prepare(); const waiting = deferred<Awaited<ReturnType<typeof f.prove>>>();
    const proof = await f.prove({ scope: f.t.choice.consent.expected.scope,
      key: f.t.choice.consent.preparation.public_key, challenge: f.wire.proposal_hash, credentialId: f.t.choice.consent.preparation.credential_id,
      validUntilMs: f.wire.valid_until * 1000 });
    f.prove.mockReturnValueOnce(waiting.promise); const action = f.flow.confirmOwner(); f.flow.dispose(); await action;
    waiting.resolve(proof); await Promise.resolve(); expect(f.flow.snapshot()).toMatchObject({ phase: 'idle', ownerConfirmed: false });
    expect(isReloadBlocked()).toBe(false); f.flow.dispose();
  });
  it.each(['identity', 'policy', 'deadline', 'pin'])('rejects a mismatched %s locator before session or HTTP access', async (field) => {
    const f = fixture(); await f.flow.prepare(); const locator = JSON.parse(f.flow.snapshot().continuation!); f.flow.dispose(); f.capture.mockClear();
    if (field === 'identity') locator.wallet_id = createResourceId('wallet');
    if (field === 'policy') locator.policy_hash = `0x${'0'.repeat(64)}`;
    if (field === 'deadline') locator.proposal_valid_until = '100';
    if (field === 'pin') locator.profile_sha256 = `0x${'0'.repeat(64)}`;
    const next = f.newFlow(); await next.restore(JSON.stringify(locator)); expect(next.snapshot().error).toBe('activation/invalid-locator');
    expect(f.capture).not.toHaveBeenCalled(); next.dispose();
  });
  it('rejects malformed/oversized locators and additional fields', async () => {
    const f = fixture();
    for (const locator of ['{', 'null', '[]', 'x'.repeat(1025)]) { await f.flow.restore(locator); expect(f.flow.snapshot().error).toBe('activation/invalid-locator'); }
    expect(f.capture).not.toHaveBeenCalled(); await f.flow.prepare();
    const locator = { ...JSON.parse(f.flow.snapshot().continuation!), token: 'not-allowed' }; f.flow.dispose(); f.capture.mockClear();
    await f.flow.restore(JSON.stringify(locator)); expect(f.capture).not.toHaveBeenCalled(); f.flow.dispose();
  });
  it('rejects changed reviewed terms and regression of an authorized receipt', async () => {
    const f = fixture(); await f.flow.prepare(); const choice = f.session.prepare.mock.calls[0][0];
    f.session.restore.mockImplementationOnce(async () => {
      const wire = { ...f.wire, wallet_id: createResourceId('wallet') };
      return { wire, preview: parseActivationPreview(f.wire, choice) };
    });
    await f.flow.restore(); expect(f.flow.snapshot()).toMatchObject({ phase: 'uncertain', error: 'activation/invalid' });
    await f.flow.confirmOwner(); expect(f.prove).not.toHaveBeenCalled();
    await f.flow.restore(); await f.confirmAll(); await f.flow.authorize(); f.wire.state = 'prepared'; await f.flow.restore();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'uncertain', error: 'activation/conflict' }); f.flow.dispose();
  });
  it('reconstructs the profile and rejects changed pins, unapproved bootstrap IDs or initial consent', () => {
    const f = fixture();
    expect(() => new ActivationFlow(f.capture, f.prove, { ...f.t.f.pin, digest: `0x${'0'.repeat(64)}` }, f.t.choice.consent, f.bootstrap, f.addresses)).toThrow();
    expect(() => new ActivationFlow(f.capture, f.prove, f.t.f.pin, f.t.choice.consent, { ...f.bootstrap, wallet_id: 'someone' }, f.addresses)).toThrow();
    expect(f.capture).not.toHaveBeenCalled();
  });
});
