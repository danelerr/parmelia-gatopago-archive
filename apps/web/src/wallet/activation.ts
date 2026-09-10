import { loadPinnedCreationProfile } from '@gatopago/shared/v3/initialization';
import { parseActivationStatus } from '@gatopago/shared/v3/activation-status';
import { parseInitializationProof } from '@gatopago/shared/v3/initialization-wire';
import { parseResourceId } from '@gatopago/shared/v3/primitives';
import { authorizeBootstrapActivation, authorizeBootstrapCommit, type ActivationEnrollment } from '@gatopago/shared/v3/bootstrap-activation';
import { parseActivationSelection, parseActivationPreview, parseActivationReceipt, parseActivationCommitPreview,
  parseActivationCommitReceipt, type ActivationSelection } from '@gatopago/shared/v3/activation-wire';
import type { WebAuthnAssertionBytes } from '@gatopago/shared/v3/webauthn';
import { externalEnrollmentRequest, importExternalEnrollment } from '@gatopago/shared/v3/external-enrollment';
import environments from '@gatopago/environment/environments.json';
import type { EnabledAuthConfig } from '../auth/config';
import { walletTransport, WalletCoreError } from './http';

type Pin = { readonly document: string; readonly digest: `0x${string}` };
type Review = { readonly wire: unknown };
class ActivationClientError extends Error {
  constructor(readonly code: 'activation/invalid' | 'activation/unavailable' | 'activation/conflict' | 'activation/expired' | 'activation/not-found' | 'activation/rate-limited') {
    super(code); this.name = 'ActivationClientError';
  }
}
function success(result: { status: number }) {
  if (result.status === 200) return;
  const codes = { 400: 'activation/invalid', 404: 'activation/not-found', 409: 'activation/conflict',
    410: 'activation/expired', 429: 'activation/rate-limited' } as const;
  throw new ActivationClientError(codes[result.status as keyof typeof codes] ?? 'activation/unavailable');
}
function checked<T>(read: () => T): T {
  try { return read(); } catch { throw new ActivationClientError('activation/invalid'); }
}
function signatureTime(r: { state: string; valid_after: number; valid_until: number }) {
  // Authorized resources allow verification of an exact historical retry only. The
  // Worker compares persisted bytes; this does not extend consent or create a new one.
  if (r.state === 'authorized') return r.valid_after;
  const now = Math.floor(Date.now() / 1000);
  if (r.state === 'expired' || now < r.valid_after || now >= r.valid_until) throw new ActivationClientError('activation/expired');
  return now;
}
function proofWire(proof: WebAuthnAssertionBytes) {
  const base64 = (bytes: Uint8Array, max: number) => {
    if (!(bytes instanceof Uint8Array) || bytes.length > max) throw new ActivationClientError('activation/invalid');
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  };
  const wire = { authenticator_data: base64(proof.authenticatorData, 1024), client_data: base64(proof.clientDataJSON, 2048), signature: base64(proof.signatureDER, 72) };
  parseInitializationProof(wire); return wire;
}

/** No WebAuthn ceremony, local key storage, auto retry, timer or submission on creation.
 * This client validates consents; Wallet Core independently proves ownership/current
 * chain state. No HTTP receipt here proves activation or receive/spend readiness. */
export function activationClient(config: EnabledAuthConfig, getToken: () => Promise<string>, pin: Pin) {
  const trusted = Object.freeze({ ...pin }), profile = loadPinnedCreationProfile(trusted.document, trusted.digest), environment = environments[config.environment];
  if (config.mode !== 'firebase' || config.webOrigin !== environment.web_origin) throw new WalletCoreError('wallet/unavailable');
  const account = Object.freeze({ generation: String(profile.deployment.generation), contract_manifest_version: profile.deployment.manifest_id });
  function selection(value: ActivationSelection) {
    return checked(() => {
      const selected = parseActivationSelection(value), e = selected.consent.expected;
      if (e.document !== trusted.document || e.profileDigest !== trusted.digest || e.scope.rpId !== environment.webauthn_rp_id
        || e.scope.origin !== environment.web_origin) throw new Error('Unapproved activation profile');
      return selected;
    });
  }
  function view(raw: unknown, selected: ActivationSelection) {
    return checked(() => { const wire: unknown = structuredClone(raw); return Object.freeze({ wire, preview: parseActivationPreview(wire, selected) }); });
  }
  function commitView(raw: unknown, selected: ActivationSelection, parent: Review, id: string) {
    return checked(() => { const wire: unknown = structuredClone(raw); return Object.freeze({ wire, preview: parseActivationCommitPreview(wire, selected, parent.wire, id) }); });
  }
  const path = (selected: ActivationSelection) => `/account-activations/${selected.activationId}`;
  const commitPath = (selected: ActivationSelection, id: string) => `${path(selected)}/commits/${parseResourceId('operation', id)}`;
  return {
    async status(choice: ActivationSelection, review: Review, commitId: string | null, signal: AbortSignal) {
      const selected = selection(choice), approved = view(review.wire, selected);
      const operationId = commitId === null ? selected.activationId : parseResourceId('operation', commitId);
      const target = commitId === null ? path(selected) : commitPath(selected, operationId);
      const result = await walletTransport(config, getToken, signal).request(`${target}/status`, 'GET', {}, 'identity');
      success(result); signal.throwIfAborted();
      return checked(() => {
        const progress = parseActivationStatus(result.value, { activationId: selected.activationId, operationId,
          kind: commitId === null ? 'prepare' : 'commit', proposalHash: approved.preview.compiled.digest });
        if (progress.policy_confirmation && progress.policy_confirmation.manifest_hash !== approved.preview.compiled.expectedManifestHash) throw new Error('Mismatched policy');
        return progress;
      });
    },
    externalProofRequest(choice: ActivationSelection, review: Review, signerIndex: number) {
      const selected = selection(choice);
      return checked(() => externalEnrollmentRequest(selected, review.wire, signerIndex, Math.floor(Date.now() / 1000)));
    },
    async importExternalProof(choice: ActivationSelection, review: Review, signerIndex: number, text: string, signal: AbortSignal) {
      const selected = selection(choice), approved = view(review.wire, selected);
      signal.throwIfAborted();
      let proof;
      try { proof = await importExternalEnrollment(selected, approved.wire, signerIndex, text, Math.floor(Date.now() / 1000)); }
      catch { throw new ActivationClientError('activation/invalid'); }
      signal.throwIfAborted(); signatureTime(approved.preview.receipt);
      return proof;
    },
    async prepare(choice: ActivationSelection, signal: AbortSignal) {
      const selected = selection(choice);
      const result = await walletTransport(config, getToken, signal).request('/account-activations', 'POST', {
        request_id: selected.activationId, initialization_id: selected.consent.preparation.initialization_id,
        wallet_id: selected.walletId, wallet_account_id: selected.walletAccountId, next_policy: selected.nextPolicy, proposal_valid_until: selected.proposalValidUntil,
      }, account);
      success(result); signal.throwIfAborted(); return view(result.value, selected);
    },
    async restore(choice: ActivationSelection, signal: AbortSignal) {
      const selected = selection(choice);
      const result = await walletTransport(config, getToken, signal).request(path(selected), 'GET', {}, 'identity');
      success(result); signal.throwIfAborted(); return view(result.value, selected);
    },
    async authorize(choice: ActivationSelection, review: Review, owner: WebAuthnAssertionBytes, enrollments: readonly ActivationEnrollment[], signal: AbortSignal) {
      const selected = selection(choice), approved = view(review.wire, selected), proof = structuredClone(owner), factors = structuredClone(enrollments);
      signal.throwIfAborted();
      const now = signatureTime(approved.preview.receipt);
      try { await authorizeBootstrapActivation(approved.preview.input, proof, factors, now); }
      catch { throw new ActivationClientError('activation/invalid'); }
      signal.throwIfAborted(); signatureTime(approved.preview.receipt);
      const payload = checked(() => ({ owner: proofWire(proof), enrollments: factors.map((p) => p.kind === 'ecdsa'
        ? { kind: p.kind, signer_index: p.signerIndex, signature: p.signature }
        : { kind: p.kind, signer_index: p.signerIndex, assertion: proofWire(p.assertion) }) }));
      const result = await walletTransport(config, getToken, signal).request(`${path(selected)}/authorize`, 'POST', payload, account);
      success(result); signal.throwIfAborted();
      const receipt = checked(() => parseActivationReceipt(result.value, selected, approved.wire));
      if (receipt.state !== 'authorized') throw new ActivationClientError('activation/invalid');
      return receipt;
    },
    async prepareCommit(choice: ActivationSelection, parent: Review, commitId: string, signal: AbortSignal) {
      const selected = selection(choice), reviewed = view(parent.wire, selected), id = parseResourceId('operation', commitId);
      if (reviewed.preview.receipt.state !== 'authorized') throw new ActivationClientError('activation/invalid');
      const result = await walletTransport(config, getToken, signal).request(`${path(selected)}/commits`, 'POST', { request_id: id }, account);
      success(result); signal.throwIfAborted(); return commitView(result.value, selected, reviewed, id);
    },
    async restoreCommit(choice: ActivationSelection, parent: Review, commitId: string, signal: AbortSignal) {
      const selected = selection(choice), reviewed = view(parent.wire, selected), target = commitPath(selected, commitId);
      if (reviewed.preview.receipt.state !== 'authorized') throw new ActivationClientError('activation/invalid');
      const result = await walletTransport(config, getToken, signal).request(target, 'GET', {}, 'identity');
      success(result); signal.throwIfAborted(); return commitView(result.value, selected, reviewed, commitId);
    },
    async authorizeCommit(choice: ActivationSelection, parent: Review, commitReview: Review, commitId: string, owner: WebAuthnAssertionBytes, signal: AbortSignal) {
      const selected = selection(choice), reviewed = view(parent.wire, selected), approved = commitView(commitReview.wire, selected, reviewed, commitId);
      const p = approved.preview, proof = structuredClone(owner), now = signatureTime(p.receipt);
      signal.throwIfAborted();
      checked(() => authorizeBootstrapCommit(p.input, p.observation, p.receipt.valid_after, p.receipt.valid_until, proof, now));
      const payload = checked(() => proofWire(proof));
      const result = await walletTransport(config, getToken, signal).request(`${commitPath(selected, commitId)}/authorize`, 'POST', payload, account);
      success(result); signal.throwIfAborted();
      const receipt = checked(() => parseActivationCommitReceipt(result.value, selected, reviewed.wire, approved.wire, commitId));
      if (receipt.state !== 'authorized') throw new ActivationClientError('activation/invalid');
      return receipt;
    },
  };
}
