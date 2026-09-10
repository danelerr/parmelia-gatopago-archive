import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAddress, zeroAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { independentGuardianAddresses, independentRecoveryPolicy } from '@gatopago/shared/v3/independent-recovery';
import { prepareBootstrapActivation, authorizeBootstrapActivation } from '@gatopago/shared/v3/bootstrap-activation';
import { hashSecurityPolicy, Role, SignerKind } from '@gatopago/shared/v3/security-policy';
import { guardianPolicyDraft, guardianPolicySelection } from '../src/wallet/activation-policy';
import { ActivationPolicyStore } from '../src/wallet/activation-policy-store';
import { policyReviewFixture } from './activation-policy.fixture';

function fixture() {
  const f = policyReviewFixture(1), keys = Array.from({ length: 3 }, () => privateKeyToAccount(generatePrivateKey()));
  const addresses = keys.map((key) => key.address);
  return { ...f, keys, addresses };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Advanced independent-recovery candidate profile', () => {
  it('keeps daily spend on the initial passkey, with 2-of-3 external recovery and no sovereignty claim', () => {
    const f = fixture(), draft = independentRecoveryPolicy(f.t.f.input.initialization, f.addresses);
    expect(draft.policy).toMatchObject({ mode: 'active', spendThreshold: 1, adminThreshold: 2, recoveryThreshold: 2,
      recoveryDelaySeconds: 259200, upgradeDelaySeconds: 259200 });
    const passkeys = draft.policy.signers.filter((s) => s.kind === SignerKind.WEBAUTHN), guardians = draft.policy.signers.filter((s) => s.kind === SignerKind.ECDSA);
    expect(passkeys).toHaveLength(1); expect(passkeys[0]).toMatchObject({ key: f.consent.preparation.public_key, roles: Role.SPEND | Role.ADMIN });
    expect(guardians).toHaveLength(3); expect(guardians.every((s) => (s.roles & Role.RECOVERY) !== 0 && (s.roles & Role.SPEND) === 0 && !s.assisted)).toBe(true);
    const admins = guardians.filter((s) => (s.roles & Role.ADMIN) !== 0);
    expect(admins).toHaveLength(1); expect(admins[0].key).toBe(f.addresses[0].toLowerCase());
    expect(admins.length).toBeLessThan(draft.policy.adminThreshold);
    expect(draft.hash).toBe(hashSecurityPolicy(draft.policy));
    expect(draft.continuity).toEqual({ direct_key_quorums: { spend: false, admin: false, recovery: true }, factor_independence: 'not_assessed', sovereign_readiness: 'not_assessed' });
    expect(draft).toMatchObject({ possession: 'not_assessed', activationReady: false, onchainAuthority: 'not_assessed' });
    expect(Object.isFrozen(draft.policy.signers)).toBe(true); expect(draft.policy.signers.every(Object.isFrozen)).toBe(true);
  });
  it('requires fresh consent from every guardian AND the initial passkey whose ADMIN role changes', async () => {
    const f = fixture(), draft = independentRecoveryPolicy(f.t.f.input.initialization, f.addresses);
    const input = { ...f.t.f.input, nextPolicy: draft.policy }, compiled = prepareBootstrapActivation(input, input.validAfter);
    expect(compiled.enrollments).toHaveLength(4);
    const proofs = await Promise.all(compiled.enrollments.map(async (p) => {
      const descriptor = compiled.nextPolicy.signers[p.signerIndex];
      if (descriptor.kind === SignerKind.WEBAUTHN) return { kind: 'webauthn' as const, signerIndex: p.signerIndex, assertion: f.t.f.assertion(p.digest) };
      const key = f.keys.find((k) => k.address.toLowerCase() === descriptor.key)!;
      return { kind: 'ecdsa' as const, signerIndex: p.signerIndex, signature: await key.sign({ hash: p.digest }) };
    }));
    const result = await authorizeBootstrapActivation(input, f.t.f.assertion(compiled.digest), proofs, input.validAfter);
    expect(result.account).toBe(f.t.f.initial.account); expect(result.account_readiness).toBe('not_assessed');
    await expect(authorizeBootstrapActivation(input, f.t.f.assertion(compiled.digest), proofs.slice(1), input.validAfter)).rejects.toThrow();
  });
  it.each(['missing', 'extra', 'duplicate', 'case-duplicate', 'zero', 'bad-checksum', 'private-key', 'ens', 'whitespace', 'self'])('rejects %s guardian configurations', (change) => {
    const f = fixture(), addresses = [...f.addresses];
    if (change === 'missing') addresses.pop();
    if (change === 'extra') addresses.push(f.t.f.keys[0].address);
    if (change === 'duplicate') addresses[1] = addresses[0];
    if (change === 'case-duplicate') addresses[1] = addresses[0].toLowerCase() as typeof addresses[number];
    if (change === 'zero') addresses[1] = zeroAddress;
    if (change === 'bad-checksum') {
      const valid = getAddress('0x52908400098527886e0f7030069857d2e4169ee7');
      addresses[1] = valid.replace('E', 'e') as typeof valid;
    }
    if (change === 'private-key') addresses[1] = generatePrivateKey();
    if (change === 'ens') addresses[1] = 'someone.eth' as typeof addresses[number];
    if (change === 'whitespace') addresses[1] = ` ${addresses[1]}` as typeof addresses[number];
    if (change === 'self') addresses[1] = f.t.f.initial.account;
    expect(() => independentRecoveryPolicy(f.t.f.input.initialization, addresses)).toThrow();
  });
  it('normalizes case and recovery-only order, while binding the selected admin guardian into the policy', () => {
    const f = fixture(), addresses = [...f.addresses], original = independentRecoveryPolicy(f.t.f.input.initialization, addresses);
    const reordered = independentRecoveryPolicy(f.t.f.input.initialization, [addresses[0], addresses[2], addresses[1]].map((address) => address.toLowerCase()));
    const otherAdmin = independentRecoveryPolicy(f.t.f.input.initialization, [addresses[1], addresses[0], addresses[2]]);
    expect(original.hash).not.toBe(otherAdmin.hash);
    addresses.length = 0; expect(original.hash).toBe(reordered.hash); expect(original.addresses).toHaveLength(3);
    expect(independentGuardianAddresses(f.addresses)).toEqual(f.addresses.map((address) => address.toLowerCase()));
  });
});

describe('Private initial-key review with external guardians', () => {
  it('supports one registered passkey, fetches only its detail, and does not generate factors or claim activation', async () => {
    const f = fixture(), capture = vi.fn(() => ({ assertCurrent: vi.fn(), detail: vi.fn(async () => f.material[0]) }));
    const store = new ActivationPolicyStore(capture);
    await store.reviewGuardians(f.consent, f.inventory, f.addresses, f.pin);
    expect(capture.mock.results[0].value.detail).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toMatchObject({ phase: 'ready', draft: { profile: 'independent-recovery', independentExit: 'recovery_quorum_only',
      activationReady: false, recoverableLostKeys: 1, possession: 'not_assessed' } });
    expect(store.snapshot().draft?.factors.filter((factor) => factor.credential)).toHaveLength(1);
  });
  it('rejects invalid guardian addresses before session/token or private I/O', async () => {
    const f = fixture(), capture = vi.fn(() => ({ assertCurrent: vi.fn(), detail: vi.fn(async () => f.material[0]) }));
    const store = new ActivationPolicyStore(capture);
    await store.reviewGuardians(f.consent, f.inventory, [f.addresses[0], f.addresses[0], f.addresses[2]], f.pin);
    expect(capture).not.toHaveBeenCalled(); expect(store.snapshot()).toMatchObject({ phase: 'error', code: 'activation/invalid-selection' });
  });
  it('copies addresses before async work and clears draft on session replacement', async () => {
    const f = fixture(), addresses = [...f.addresses], assertCurrent = vi.fn(), detail = vi.fn(async () => f.material[0]);
    const store = new ActivationPolicyStore(() => ({ assertCurrent, detail }));
    const pending = store.reviewGuardians(f.consent, f.inventory, addresses, f.pin); addresses[0] = zeroAddress; await pending;
    expect(store.snapshot().phase).toBe('ready');
    assertCurrent.mockImplementation(() => { throw new Error('Replaced'); }); store.checkSession();
    expect(store.snapshot()).toMatchObject({ phase: 'closed', draft: null });
  });
  it.each(['initial-key', 'initial-id', 'missing', 'pin', 'unauthorized'])('rejects %s initial material', (change) => {
    const f = fixture(), consent = structuredClone(f.consent), material = structuredClone(f.material), pin = { ...f.pin };
    if (change === 'initial-key') Object.assign(material[0], { public_key: policyReviewFixture(1).material[0].public_key });
    if (change === 'initial-id') Object.assign(material[0], { credential_id: 'Zg' });
    if (change === 'missing') material.length = 0;
    if (change === 'pin') pin.document += ' ';
    if (change === 'unauthorized') Object.assign(consent.preparation, { state: 'prepared' });
    expect(() => guardianPolicyDraft(guardianPolicySelection(consent, f.inventory, f.addresses, pin), material)).toThrow();
  });
});
