import { parseActivationSelection, parseActivationPreview, parseActivationReceipt, type ActivationSelection } from '@gatopago/shared/v3/activation-wire';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import { parseInitializationPreparation, parseInitializationProof } from '@gatopago/shared/v3/initialization-wire';
import { independentRecoveryPolicy } from '@gatopago/shared/v3/independent-recovery';
import { createResourceId, parseResourceId } from '@gatopago/shared/v3/primitives';
import { SignerKind } from '@gatopago/shared/v3/security-policy';
import { encodeWebAuthnAssertion, type WebAuthnAssertionBytes } from '@gatopago/shared/v3/webauthn';
import type { ActivationEnrollment } from '@gatopago/shared/v3/bootstrap-activation';
import type { BrowserAuth } from '../auth/browser';
import { holdPageReload } from '../pwa/reload-guard';
import type { CreationProfilePin } from './creation-release';
import type { requestPasskeyProof } from './passkeys';
import { activationContinuation, restoreActivationContinuation } from './activation-continuation';

type Session = Awaited<ReturnType<BrowserAuth['activation']>>;
type Preview = ReturnType<typeof parseActivationPreview>;
type Phase = 'idle' | 'loading' | 'tracking' | 'absent' | 'preparing' | 'ready' | 'proving' | 'importing' | 'submitting' | 'uncertain' | 'authorized' | 'expired' | 'closed';
type Guardian = Readonly<{ index: number; address: string; roles: number; confirmed: boolean }>;
type View = Readonly<{ phase: Phase; error: string | null; continuation: string | null;
  progress: Awaited<ReturnType<Session['status']>> | null;
  review: Readonly<{ account: string; network: string; digest: string; expiresAt: number }> | null;
  receipt: Preview['receipt'] | null; ownerConfirmed: boolean; initialRoleConfirmed: boolean;
  guardians: readonly Guardian[]; submitted: boolean }>;
const failure = (code: string) => Object.assign(new Error(code), { code });
const codeOf = (e: unknown) => e && typeof e === 'object' && 'code' in e && typeof e.code === 'string' ? e.code : 'activation/unavailable';
const sessionErrors = new Set(['auth/session-changed', 'auth/unauthenticated', 'client/update-required']);

/** Component-owned, explicit-action activation. Constructor is inert; restore is
 * read-only; owner and changed-role consents are separate gestures. Proofs never
 * appear in snapshots/storage and an uncertain POST never chooses a new ID.
 * Authorized means persisted consent, NOT onchain activation or spend readiness. */
export class ActivationFlow {
  private readonly base: Omit<ActivationSelection, 'activationId' | 'proposalValidUntil'>;
  private choice: ReturnType<typeof parseActivationSelection> | null = null;
  private operation: { wire: unknown; preview: Preview } | null = null;
  private session: Session | null = null;
  private owner: WebAuthnAssertionBytes | null = null;
  private factors = new Map<number, ActivationEnrollment>();
  private submission: { owner: WebAuthnAssertionBytes; factors: ActivationEnrollment[] } | null = null;
  private active: AbortController | null = null;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private view: View = Object.freeze({ phase: 'idle', error: null, continuation: null, review: null, receipt: null, progress: null,
    ownerConfirmed: false, initialRoleConfirmed: false, guardians: Object.freeze([]), submitted: false });

  constructor(private readonly captureSession: () => Promise<Session>, private readonly prove: typeof requestPasskeyProof,
    pin: CreationProfilePin, consent: CreationConsent, bootstrap: { wallet_id: string; wallet_account_id: string }, addresses: readonly string[]) {
    const expected = Object.freeze({ ...consent.expected, scope: Object.freeze({ ...consent.expected.scope }) });
    if (expected.document !== pin.document || expected.profileDigest !== pin.digest) throw failure('activation/invalid');
    const preparation = parseInitializationPreparation(structuredClone(consent.preparation), expected);
    if (preparation.state !== 'authorized') throw failure('activation/invalid');
    const draft = independentRecoveryPolicy({ document: expected.document, expectedDigest: expected.profileDigest, scope: expected.scope,
      publicKey: preparation.public_key, userSaltCommitment: expected.userSaltCommitment,
      validAfter: preparation.valid_after, validUntil: preparation.valid_until }, addresses);
    this.base = Object.freeze({ consent: Object.freeze({ expected, preparation }), nextPolicy: draft.policy,
      walletId: parseResourceId('wallet', bootstrap.wallet_id), walletAccountId: parseResourceId('walletAccount', bootstrap.wallet_account_id) });
  }
  snapshot = () => this.view;
  commitContext() {
    this.session?.assertCurrent();
    if (this.active || this.view.phase !== 'authorized' || !this.choice || !this.operation || this.view.receipt?.state !== 'authorized') return null;
    const choice = structuredClone(this.choice);
    const parent = { wire: { ...structuredClone(this.operation.preview.receipt), state: 'authorized' as const,
      input: structuredClone(this.operation.preview.input) } };
    parseActivationPreview(parent.wire, choice);
    return { choice, parent };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(phase: Phase, error: string | null = null, changes: Partial<Omit<View, 'phase' | 'error'>> = {}) {
    clearTimeout(this.expiry);
    this.view = Object.freeze({ ...this.view, ...changes, phase, error });
    if (phase === 'ready' && this.operation) {
      this.expiry = setTimeout(() => this.expire(), Math.max(0, this.operation.preview.receipt.valid_until * 1000 - Date.now()));
    }
    this.listeners.forEach((listener) => listener());
  }
  private clearProofs() { this.owner = null; this.factors.clear(); this.submission = null; }
  private proofStatus() {
    const signers = this.base.nextPolicy.signers;
    return { ownerConfirmed: this.owner !== null, initialRoleConfirmed: this.factors.has(signers.findIndex((s) => s.kind === SignerKind.WEBAUTHN)),
      submitted: this.submission !== null, guardians: Object.freeze(signers.flatMap((s, index) => s.kind === SignerKind.ECDSA
        ? [Object.freeze({ index, address: s.key, roles: s.roles, confirmed: this.factors.has(index) })] : [])) };
  }
  private expire() {
    // Expiration of a local clock does not undo a POST that may have been accepted.
    if (this.submission) { this.set('uncertain', 'activation/result-unknown'); return; }
    this.clearProofs(); this.set('expired', 'activation/expired', this.proofStatus());
  }
  checkSession() { try { this.session?.assertCurrent(); } catch { this.invalidate(); } }
  invalidate() {
    this.dispose(); this.set('closed', 'auth/session-changed');
  }
  dispose() {
    this.active?.abort(); this.active = null; this.session = null; this.operation = null; this.choice = null; this.clearProofs();
    this.set(this.view.phase === 'closed' ? 'closed' : 'idle', null, { continuation: null, review: null, receipt: null, progress: null,
      ownerConfirmed: false, initialRoleConfirmed: false, guardians: Object.freeze([]), submitted: false });
  }
  stop() {
    if (!this.active) return;
    const tracking = this.view.phase === 'tracking';
    const local = this.view.phase === 'proving' || this.view.phase === 'importing';
    this.active.abort(); this.active = null;
    this.set(tracking ? 'authorized' : local ? 'ready' : 'uncertain', tracking ? 'activation/status-stopped'
      : local ? 'activation/verification-stopped' : 'activation/result-unknown');
  }
  private live() {
    const r = this.operation?.preview.receipt;
    if (!r || r.state !== 'prepared' || Date.now() < r.valid_after * 1000 || Date.now() >= r.valid_until * 1000) throw failure('activation/expired');
  }
  private async run(phase: Phase, action: (signal: AbortSignal, current: () => void) => Promise<void>, fallback: Phase) {
    if (this.active || this.view.phase === 'closed') return;
    const controller = new AbortController(); this.active = controller;
    const current = () => { controller.signal.throwIfAborted(); if (this.active !== controller) throw failure('auth/session-changed'); this.session?.assertCurrent(); };
    const release = holdPageReload();
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => { abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', abort, { once: true }); });
    const timeout = setTimeout(() => controller.abort(failure('activation/timeout')), phase === 'proving' ? 90_000 : 30_000);
    this.set(phase);
    try { await Promise.race([(async () => { current(); await action(controller.signal, current); })(), cancelled]); }
    catch (e) {
      if (this.active === controller) {
        const code = codeOf(e);
        if (sessionErrors.has(code)) { this.invalidate(); this.set('closed', code); }
        else if (code === 'activation/expired' || code === 'expired') this.expire();
        else if (code === 'activation/timeout' && (phase === 'proving' || phase === 'importing')) this.set('ready', 'activation/verification-stopped');
        else this.set(fallback, phase === 'tracking' ? 'activation/status-unavailable' : code);
      }
    } finally {
      clearTimeout(timeout); controller.signal.removeEventListener('abort', abort);
      if (this.active === controller) this.active = null;
      release();
    }
  }
  private async sessionFor(current: () => void) {
    if (!this.session) { const session = await this.captureSession(); current(); session.assertCurrent(); this.session = session; }
    return this.session;
  }
  private accept(value: { wire: unknown }) {
    let wire: unknown, preview: Preview;
    try { wire = structuredClone(value.wire); preview = parseActivationPreview(wire, this.choice!); }
    catch { throw failure('activation/invalid'); }
    if ((this.operation && JSON.stringify(this.operation.preview.input) !== JSON.stringify(preview.input))
      || (this.view.receipt?.state === 'authorized' && preview.receipt.state !== 'authorized')) throw failure('activation/conflict');
    this.operation = { wire, preview };
    const { compiled, receipt } = preview;
    if (receipt.state === 'authorized') this.clearProofs();
    this.set(receipt.state === 'authorized' ? 'authorized' : 'ready', null, { receipt, ...this.proofStatus(),
      review: Object.freeze({ account: compiled.initial.account, network: compiled.initial.profile.deployment.network_id,
        digest: compiled.digest, expiresAt: receipt.valid_until }) });
    if (receipt.state !== 'authorized' && (receipt.state === 'expired' || Date.now() < receipt.valid_after * 1000 || Date.now() >= receipt.valid_until * 1000)) this.expire();
  }
  prepare() {
    if (!['idle', 'absent'].includes(this.view.phase)) return Promise.resolve();
    return this.run('preparing', async (signal, current) => {
      if (!this.choice) {
        this.choice = parseActivationSelection({ ...this.base, activationId: createResourceId('operation'), proposalValidUntil: Math.floor(Date.now() / 1000) + 86400 });
        this.set('preparing', null, { continuation: activationContinuation(this.choice) });
      }
      if (this.choice.proposalValidUntil <= Math.floor(Date.now() / 1000) + 300) throw failure('activation/expired');
      if (this.choice.proposalValidUntil > Math.floor(Date.now() / 1000) + 7 * 86400) throw failure('activation/invalid');
      const session = await this.sessionFor(current); current();
      const response = await session.prepare(this.choice, signal); current(); this.accept(response);
    }, 'uncertain');
  }
  restore(locator?: string) {
    if (this.active || this.view.phase === 'closed') return Promise.resolve();
    if (!this.choice) {
      try {
        this.choice = parseActivationSelection(restoreActivationContinuation(locator!, this.base));
        this.set('idle', null, { continuation: activationContinuation(this.choice) });
      } catch { this.set('idle', 'activation/invalid-locator'); return Promise.resolve(); }
    } else if (locator !== undefined) {
      this.set(this.view.phase, 'activation/invalid-locator'); return Promise.resolve();
    }
    return this.run('loading', async (signal, current) => {
      const session = await this.sessionFor(current); current();
      let response;
      try { response = await session.restore(this.choice!, signal); current(); }
      catch (e) {
        current();
        if (codeOf(e) !== 'activation/not-found' || this.operation || this.submission) throw e;
        this.set('absent'); return;
      }
      this.accept(response);
    }, 'uncertain');
  }
  confirmOwner() { return this.confirm('owner'); }
  checkProgress() {
    if (this.view.phase !== 'authorized' || !this.operation || !this.session || !this.choice) return Promise.resolve();
    this.set('authorized', null, { progress: null });
    return this.run('tracking', async (signal, current) => {
      const progress = await this.session!.status(this.choice!, this.operation!, null, signal); current();
      if (progress.consent_state !== 'authorized') throw failure('activation/invalid');
      this.set('authorized', null, { progress });
    }, 'authorized');
  }
  confirmInitialRole() { return this.confirm('role'); }
  private confirm(kind: 'owner' | 'role') {
    const index = this.base.nextPolicy.signers.findIndex((s) => s.kind === SignerKind.WEBAUTHN);
    if (this.view.phase !== 'ready' || !this.session || !this.operation || this.submission || (kind === 'owner' ? this.owner : this.factors.has(index))) return Promise.resolve();
    return this.run('proving', async (signal, current) => {
      this.live();
      const compiled = this.operation!.preview.compiled, digest = kind === 'owner' ? compiled.digest : compiled.enrollments.find((p) => p.signerIndex === index)!.digest;
      const p = this.base.consent.preparation, scope = this.base.consent.expected.scope;
      // No await, token request, dynamic import or HTTP before invoking the browser ceremony.
      const wire = await this.prove({ scope, key: p.public_key, challenge: digest, credentialId: p.credential_id,
        validUntilMs: this.operation!.preview.receipt.valid_until * 1000, signal });
      current(); this.live();
      let proof: WebAuthnAssertionBytes;
      try {
        proof = parseInitializationProof(wire);
        encodeWebAuthnAssertion({ scope, key: p.public_key, challenge: digest, response: proof });
      } catch { throw failure('activation/invalid-proof'); }
      if (kind === 'owner') this.owner = structuredClone(proof);
      else this.factors.set(index, { kind: 'webauthn', signerIndex: index, assertion: structuredClone(proof) });
      this.set('ready', null, this.proofStatus());
    }, 'ready');
  }
  externalRequest(index: number) {
    if (this.view.phase !== 'ready' || !this.operation || !this.session || this.submission) return null;
    try { this.session.assertCurrent(); this.live(); return this.session.externalProofRequest(this.choice!, this.operation, index); }
    catch (e) { const code = codeOf(e); if (sessionErrors.has(code)) this.invalidate(); else if (code === 'activation/expired') this.expire(); else this.set('ready', code); return null; }
  }
  importExternal(index: number, text: string) {
    if (this.view.phase !== 'ready' || !this.operation || !this.session || this.submission || this.factors.has(index)) return Promise.resolve();
    return this.run('importing', async (signal, current) => {
      this.live();
      let proof;
      try { proof = await this.session!.importExternalProof(this.choice!, this.operation!, index, text, signal); }
      catch (e) { current(); this.live(); if (sessionErrors.has(codeOf(e))) throw e; throw failure('activation/invalid-proof'); }
      current(); this.live();
      if (proof.kind !== 'ecdsa' || proof.signerIndex !== index || this.base.nextPolicy.signers[index]?.kind !== SignerKind.ECDSA) throw failure('activation/invalid-proof');
      this.factors.set(index, structuredClone(proof)); this.set('ready', null, this.proofStatus());
    }, 'ready');
  }
  authorize() {
    if (this.view.phase !== 'ready' || !this.operation || !this.session || !this.owner
      || this.operation.preview.compiled.enrollments.some((p) => !this.factors.has(p.signerIndex))) return Promise.resolve();
    return this.run('submitting', async (signal, current) => {
      this.live();
      // Freeze the exact bytes before the first send. After an uncertain result,
      // only GET and an explicit retry of these bytes may follow, never new proofs.
      this.submission ??= { owner: structuredClone(this.owner!), factors: this.operation!.preview.compiled.enrollments.map((p) => structuredClone(this.factors.get(p.signerIndex)!)) };
      this.set('submitting', null, this.proofStatus());
      const result = await this.session!.authorize(this.choice!, this.operation!, structuredClone(this.submission.owner), structuredClone(this.submission.factors), signal); current();
      let receipt;
      try { receipt = parseActivationReceipt(result, this.choice!, this.operation!.wire); }
      catch { throw failure('activation/invalid'); }
      if (receipt.state !== 'authorized') throw failure('activation/invalid');
      this.clearProofs(); this.set('authorized', null, { receipt, ...this.proofStatus() });
    }, 'uncertain');
  }
}
