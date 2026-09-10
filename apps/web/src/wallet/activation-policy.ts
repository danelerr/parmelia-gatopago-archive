import { parseCredentialDetail, type CredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { parseCredentialInventory, type CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import { parseInitializationPreparation } from '@gatopago/shared/v3/initialization-wire';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import { hashSecurityPolicy, Role, SignerKind, signerId, type SecurityPolicy } from '@gatopago/shared/v3/security-policy';
import { independentGuardianAddresses, independentRecoveryPolicy } from '@gatopago/shared/v3/independent-recovery';
import type { CreationProfilePin } from './creation-release';

const invalid = (): never => { throw Object.assign(new Error('Invalid policy selection'), { code: 'activation/invalid-selection' }); };
export function policySelection(consent: CreationConsent, inventory: CredentialInventory, references: readonly string[], pin: CreationProfilePin) {
  return selection(consent, inventory, references, pin, 2);
}
function selection(consent: CreationConsent, inventory: CredentialInventory, references: readonly string[], pin: CreationProfilePin, minimum: number) {
  if (consent.expected.document !== pin.document || consent.expected.profileDigest !== pin.digest) return invalid();
  const expected = Object.freeze({ ...consent.expected, scope: Object.freeze({ ...consent.expected.scope }) });
  const preparation = parseInitializationPreparation(consent.preparation, expected);
  if (preparation.state !== 'authorized') return invalid();
  const listed = parseCredentialInventory(inventory, expected.scope);
  const refs = [preparation.credential_ref, ...references];
  if (refs.length < minimum || refs.length > 16 || new Set(refs).size !== refs.length ||
      refs.some((id) => !listed.data.some((row) => row.credential_ref === id))) return invalid();
  return Object.freeze({ consent: Object.freeze({ expected, preparation }), inventory: listed, references: Object.freeze(refs) });
}

export function guardianPolicySelection(consent: CreationConsent, inventory: CredentialInventory, addresses: readonly string[], pin: CreationProfilePin) {
  const selected = selection(consent, inventory, [], pin, 1);
  try { return Object.freeze({ ...selected, addresses: independentGuardianAddresses(addresses) }); }
  catch { return invalid(); }
}

export function guardianPolicyDraft(selected: ReturnType<typeof guardianPolicySelection>, material: readonly CredentialDetail[]) {
  const { expected, preparation } = selected.consent;
  if (material.length !== 1) return invalid();
  const credential = parseCredentialDetail(material[0], expected.scope, preparation.credential_ref);
  if (credential.credential_id !== preparation.credential_id || credential.public_key !== preparation.public_key) return invalid();
  const draft = independentRecoveryPolicy({ document: expected.document, expectedDigest: expected.profileDigest, scope: expected.scope,
    publicKey: preparation.public_key, userSaltCommitment: expected.userSaltCommitment,
    validAfter: preparation.valid_after, validUntil: preparation.valid_until }, selected.addresses);
  return Object.freeze({ ...draft, profile: 'independent-recovery' as const, scope: expected.scope,
    factors: Object.freeze(draft.policy.signers.map((descriptor) => Object.freeze({ descriptor, signerId: signerId(descriptor),
      credential: descriptor.kind === SignerKind.WEBAUTHN ? credential : null }))),
    recoverableLostKeys: 1, independentExit: 'recovery_quorum_only' as const });
}

/** Review of a passkey quorum, NOT a release-approved activation profile. Even
 * several physical authenticators share the RP dependency. Independent exit
 * factors and their proofs must be configured before enabling account use.
 */
export function passkeyPolicyDraft(selection: ReturnType<typeof policySelection>, material: readonly CredentialDetail[]) {
  const { consent, references } = selection, { expected, preparation } = consent;
  if (material.length !== references.length) return invalid();
  const details = references.map((id, index) => parseCredentialDetail(material[index], expected.scope, id));
  if (details[0].credential_id !== preparation.credential_id || details[0].public_key !== preparation.public_key ||
      new Set(details.map((row) => row.credential_id)).size !== details.length) return invalid();
  const initial = prepareInitialization({ document: expected.document, expectedDigest: expected.profileDigest,
    scope: expected.scope, publicKey: preparation.public_key, userSaltCommitment: expected.userSaltCommitment,
    validAfter: preparation.valid_after, validUntil: preparation.valid_until });
  const factors = details.map((credential) => {
    const descriptor = Object.freeze({ kind: SignerKind.WEBAUTHN, verifier: initial.profile.webauthn_verifier.address,
      verifierCodeHash: initial.profile.webauthn_verifier.runtime_code_hash, key: credential.public_key,
      roles: Role.SPEND | Role.ADMIN | Role.RECOVERY, assisted: false });
    return Object.freeze({ credential, descriptor, signerId: signerId(descriptor) });
  }).sort((a, b) => a.signerId < b.signerId ? -1 : a.signerId > b.signerId ? 1 : 0);
  const policy: SecurityPolicy = Object.freeze({ ...initial.policy, mode: 'active',
    signers: Object.freeze(factors.map((factor) => factor.descriptor)), spendThreshold: 1, adminThreshold: 2, recoveryThreshold: 2 });
  const hash = hashSecurityPolicy(policy); // Includes duplicate-physical-key and reachable-quorum checks.
  return Object.freeze({ profile: 'passkey-quorum' as const, policy, hash, factors: Object.freeze(factors), scope: Object.freeze({ ...expected.scope }),
    recoverableLostKeys: factors.length - policy.recoveryThreshold,
    independentExit: 'not_configured' as const, possession: 'not_assessed' as const,
    activationReady: false as const, onchainAuthority: 'not_assessed' as const });
}
