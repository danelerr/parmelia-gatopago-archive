import { vi } from 'vitest';
import { prepareBootstrapActivation, authorizeBootstrapActivation } from '@gatopago/shared/v3/bootstrap-activation';
import { parseActivationPreview, type ActivationSelection } from '@gatopago/shared/v3/activation-wire';
import { externalEnrollmentRequest, importExternalEnrollment } from '@gatopago/shared/v3/external-enrollment';
import type { BrowserAuth } from '../src/auth/browser';
import type { requestPasskeyProof } from '../src/wallet/passkeys';
import { ActivationFlow } from '../src/wallet/activation-flow';
import { activationWireFixture } from './activation.fixture';

type Session = Awaited<ReturnType<BrowserAuth['activation']>>;
export const activationError = (code: string) => Object.assign(new Error(code), { code });
export function activationFlowFixture() {
  const t = activationWireFixture(), keys = [...t.f.keys, activationWireFixture().f.keys[0]];
  const addresses = keys.map((key) => key.address), bootstrap = { wallet_id: t.choice.walletId, wallet_account_id: t.choice.walletAccountId };
  let wire: ReturnType<typeof wireFor> | null = null;
  function wireFor(choice: ActivationSelection) {
    const input = { ...t.f.input, nextPolicy: choice.nextPolicy, proposalValidUntil: choice.proposalValidUntil };
    const compiled = prepareBootstrapActivation(input, input.validAfter);
    return { ...t.receipt, activation_id: choice.activationId, proposal_hash: compiled.digest, expected_manifest_hash: compiled.expectedManifestHash,
      proposal_valid_until: choice.proposalValidUntil, input: structuredClone(input), state: 'prepared' as 'prepared' | 'authorized' | 'expired' };
  }
  const prepare = async (choice: ActivationSelection) => { wire = wireFor(choice); return { wire: structuredClone(wire), preview: parseActivationPreview(wire, choice) }; };
  const restore = async (choice: ActivationSelection) => {
    if (!wire) throw activationError('activation/not-found');
    return { wire: structuredClone(wire), preview: parseActivationPreview(wire, choice) };
  };
  const session = {
    status: vi.fn<Session['status']>(),
    assertCurrent: vi.fn(), prepare: vi.fn<Session['prepare']>(prepare), restore: vi.fn<Session['restore']>(restore),
    authorize: vi.fn<Session['authorize']>(async (choice, reviewed, owner, factors) => {
      const preview = parseActivationPreview(reviewed.wire, choice);
      await authorizeBootstrapActivation(preview.input, owner, factors, Math.floor(Date.now() / 1000));
      wire!.state = 'authorized'; return { ...preview.receipt, state: 'authorized' };
    }),
    externalProofRequest: vi.fn<Session['externalProofRequest']>((choice, reviewed, index) => externalEnrollmentRequest(choice, reviewed.wire, index, Math.floor(Date.now() / 1000))),
    importExternalProof: vi.fn<Session['importExternalProof']>((choice, reviewed, index, text) => importExternalEnrollment(choice, reviewed.wire, index, text, Math.floor(Date.now() / 1000))),
    prepareCommit: vi.fn<Session['prepareCommit']>(), restoreCommit: vi.fn<Session['restoreCommit']>(), authorizeCommit: vi.fn<Session['authorizeCommit']>(),
  };
  const capture = vi.fn<() => Promise<Session>>(async () => session);
  const prove = vi.fn<typeof requestPasskeyProof>(async ({ challenge }) => {
    const proof = t.f.assertion(challenge);
    return { authenticator_data: Buffer.from(proof.authenticatorData).toString('base64url'), client_data: Buffer.from(proof.clientDataJSON).toString('base64url'),
      signature: Buffer.from(proof.signatureDER).toString('base64url') };
  });
  const newFlow = () => new ActivationFlow(capture, prove, t.f.pin, t.choice.consent, bootstrap, addresses);
  const flow = newFlow();
  async function external(index: number, target = flow) {
    const request = target.externalRequest(index)!;
    const key = keys.find((key) => key.address.toLowerCase() === request.summary.signer_address)!;
    return JSON.stringify({ schema_version: 1, purpose: 'gatopago-v3-enrollment-proof', activation_id: request.summary.activation_id,
      signer_index: index, digest: request.summary.digest, signature: await key.signTypedData(request.typedData) });
  }
  async function confirmAll() {
    await flow.confirmOwner(); await flow.confirmInitialRole();
    for (const guardian of flow.snapshot().guardians) await flow.importExternal(guardian.index, await external(guardian.index));
  }
  return { t, keys, addresses, bootstrap, session, capture, prove, flow, newFlow, external, confirmAll, prepare,
    get wire() { return wire!; } };
}
