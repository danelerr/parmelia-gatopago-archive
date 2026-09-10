import { parseResourceId } from '@gatopago/shared/v3/primitives';
import type { ActivationSelection } from '@gatopago/shared/v3/activation-wire';
import { hashSecurityPolicy } from '@gatopago/shared/v3/security-policy';

/** Public locator only. No proofs, token, key material, URLs or executable payload.
 * Import never selects guardians or a deployment: those are reviewed independently.
 * This is NOT a recovery kit or evidence that an operation exists on the server. */
export function activationContinuation(choice: ActivationSelection) {
  return JSON.stringify({ schema_version: 1, purpose: 'gatopago-v3-activation-continuation',
    activation_id: choice.activationId, initialization_id: choice.consent.preparation.initialization_id,
    wallet_id: choice.walletId, wallet_account_id: choice.walletAccountId,
    profile_sha256: choice.consent.expected.profileDigest, policy_hash: hashSecurityPolicy(choice.nextPolicy),
    proposal_valid_until: choice.proposalValidUntil });
}

export function restoreActivationContinuation(text: string, expected: Omit<ActivationSelection, 'activationId' | 'proposalValidUntil'>) {
  if (typeof text !== 'string' || text.length > 1024 || new TextEncoder().encode(text).length > 1024) throw new Error('Invalid activation locator');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid activation locator');
  const r = value as Record<string, unknown>;
  const activationId = parseResourceId('operation', r.activation_id), until = r.proposal_valid_until;
  if (typeof until !== 'number' || !Number.isSafeInteger(until) || until < 1 || until >= 2 ** 48) throw new Error('Invalid activation locator');
  const choice = { ...expected, activationId, proposalValidUntil: until };
  const canonical = JSON.parse(activationContinuation(choice)) as Record<string, unknown>;
  if (Object.keys(r).length !== Object.keys(canonical).length || Object.entries(canonical).some(([key, value]) => r[key] !== value)) {
    throw new Error('Activation locator does not match the reviewed account and policy');
  }
  return choice;
}
