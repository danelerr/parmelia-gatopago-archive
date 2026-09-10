import { authorizeBootstrapActivation, authorizeBootstrapCommit, prepareBootstrapActivation, prepareBootstrapCommit, type ActivationEnrollment, type BootstrapActivationInput } from '../../../../shared/v3/bootstrapActivation';
import { deploymentDocumentDigest } from '../../../../shared/v3/deployment';
import { assessCheckpointFinality, type FinalityAssessment } from '../../../../shared/v3/finality';
import { prepareInitialization } from '../../../../shared/v3/initialization';
import { parseResourceId, type ResourceId } from '../../../../shared/v3/primitives';
import type { SecurityPolicy } from '../../../../shared/v3/securityPolicy';
import type { WebAuthnAssertionBytes, WebAuthnScope } from '../../../../shared/v3/webauthn';
import type { VerifiedIdentity } from '../auth/identity';
import { createInspectionClient } from '../chainInspection';
import { InitializationRepository, type CreationProfilePin } from './initialization';
import { inspectOwnedWalletAccount, type InspectionProfile } from './inspection';
import { WalletAccessError, WalletRepository } from './repository';
import { activationCommitSnapshot, activationPolicy, activationProofs, activationSnapshot, readActivationCommitConfirmation, readActivationCommitSnapshot,
 readActivationProofs, readActivationSnapshot } from './activationRecord';
import { restoreActivationAuthorization, restoreActivationCommitAuthorization } from './activationAuthorization';
import { readAssertionRecord, writeAssertionRecord } from './assertionRecord';

type Row = Record<string, unknown>;
type Owned = Awaited<ReturnType<WalletRepository['ownedAccount']>>;
/** Server-only admission/finality resolver; never a request body or a persisted success.
 * It must assess a fresh common finalized checkpoint for the owned, pinned network. */
export type ActivationProfiles = (owned: Owned, signal: AbortSignal) => Promise<readonly InspectionProfile[]>;
interface Request {
 readonly id: ResourceId<'operation'>;
 readonly initializationId: ResourceId<'operation'>;
 readonly walletId: ResourceId<'wallet'>;
 readonly walletAccountId: ResourceId<'walletAccount'>;
 readonly nextPolicy: SecurityPolicy;
 readonly proposalValidUntil: number;
}
export class ActivationError extends Error {
 constructor(readonly code: 'ACTIVATION_EXPIRED' | 'ACTIVATION_CONFLICT' | 'ACTIVATION_LIMIT' | 'ACTIVATION_PROFILE_UNAVAILABLE' | 'ACTIVATION_STATE_CHANGED' | 'ACTIVATION_REQUIRED' | 'INVALID_ACTIVATION_PROOF') {
  super(code); this.name = 'ActivationError';
 }
}
const now = () => Math.floor(Date.now() / 1000);
const invalid = () => new WalletAccessError('WALLET_DATA_INVALID');
const AUTH = `u.firebase_project_id = ? AND u.firebase_subject = ? AND u.disabled_at IS NULL AND u.auth_not_before <= ?`;

/** Durable, owner-scoped bootstrap preparation and second confirmation consent.
 * Authorization atomically records durable delivery work. No HTTP broadcast, automatic
 * nonce retry, onchain execution, projection activation or receive/spend admission occurs here.
 * Instantiate per request. The default profile resolver denies all networks. */
export class ActivationRepository {
 private readonly db: D1DatabaseSession;
 private readonly wallets: WalletRepository;
 private readonly initializations: InitializationRepository;
 private readonly identity: VerifiedIdentity;
 constructor(database: D1Database, identity: VerifiedIdentity, scope: WebAuthnScope, profiles: readonly CreationProfilePin[],
  private readonly resolveProfiles: ActivationProfiles = async () => { throw new ActivationError('ACTIVATION_PROFILE_UNAVAILABLE'); }) {
  this.identity = Object.freeze({ ...identity });
  this.db = database.withSession('first-primary');
  this.wallets = new WalletRepository(database, this.identity);
  this.initializations = new InitializationRepository(database, this.identity, scope, profiles);
 }
 private auth() { return [this.identity.projectId, this.identity.subject, this.identity.authTime] as const; }
 private select(id: ResourceId<'operation'>) {
  return this.db.prepare(`SELECT a.* FROM account_activations a JOIN user_identities u ON u.id = a.user_id
   WHERE a.id = ? AND ${AUTH}`).bind(id, ...this.auth());
 }
 private async context(initializationId: ResourceId<'operation'>, walletId: ResourceId<'wallet'>, walletAccountId: ResourceId<'walletAccount'>) {
  const owned = await this.wallets.ownedAccount(walletId, walletAccountId);
  const source = await this.initializations.readAuthorized(initializationId), initial = prepareInitialization(source.input);
  if (owned.account_id !== initial.message.accountId || owned.address !== initial.account.toLowerCase()
   || owned.network_id !== initial.profile.deployment.network_id || owned.deployment_state !== 'active'
   || owned.deployment_manifest_sha256 !== deploymentDocumentDigest(JSON.stringify(initial.profile.deployment))) throw invalid();
  return { owned, source, initial, initializationId, walletId, walletAccountId };
 }
 private async observe(c: Awaited<ReturnType<ActivationRepository['context']>>, signal: AbortSignal, reviewed?: FinalityAssessment['target']) {
  signal.throwIfAborted();
  // Use the same detached server admission for state inspection and acknowledgement.
  // The resolver's caller must not be able to replace an RPC/policy between those awaits.
  const profiles = structuredClone(await this.resolveProfiles(c.owned, signal));
  const observed = await inspectOwnedWalletAccount(this.wallets, c.walletId, c.walletAccountId, profiles, signal);
  if (observed.status !== 'recognized') throw new ActivationError('ACTIVATION_STATE_CHANGED');
  let acknowledgement: FinalityAssessment | null = null;
  if (reviewed) {
   const matching = profiles.filter((p) => p.digest === c.owned.deployment_manifest_sha256);
   if (matching.length !== 1) throw new ActivationError('ACTIVATION_PROFILE_UNAVAILABLE');
   const p = matching[0], deployment = c.initial.profile.deployment;
   acknowledgement = await assessCheckpointFinality(p.rpcUrls.map((url) => createInspectionClient(url, signal)), {
    ...reviewed, network_id: deployment.network_id, genesis_hash: deployment.genesis_hash }, p.finalityPolicy, signal);
   if (acknowledgement.status !== 'finalized') throw new ActivationError('ACTIVATION_STATE_CHANGED');
  }
  signal.throwIfAborted();
  const expires = Math.min(observed.security_expires_at, acknowledgement?.expires_at ?? Number.MAX_SAFE_INTEGER);
  if (now() >= expires) throw new ActivationError('ACTIVATION_EXPIRED');
  return { ...observed, security_expires_at: expires, acknowledgement };
 }
 /** SQL rechecks ownership, session cutoff, exact identity, original consent/key and deployment
  * pins at the write, not merely in an earlier RPC/GET. No database snapshot grants money rights. */
 private guard(c: Awaited<ReturnType<ActivationRepository['context']>>) {
  const o = c.owned, i = c.initial;
  return { sql: `FROM wallet_accounts a JOIN wallets w ON w.id = a.wallet_id
   JOIN parties p ON p.id = w.owner_party_id JOIN user_identities u ON u.id = p.user_id
   JOIN account_identities ci ON ci.id = a.account_identity_id AND ci.wallet_id = w.id
   JOIN account_instances ai ON ai.account_identity_id = ci.id AND ai.network_id = a.network_id
   JOIN account_initializations i ON i.user_id = u.id
   JOIN webauthn_credentials k ON k.id = i.credential_ref AND k.user_id = u.id
   WHERE ${AUTH} AND unixepoch() < ? AND i.id = ? AND a.id = ? AND w.id = ?
   AND p.kind = 'individual' AND w.status = 'active' AND w.controller = 'end_user' AND w.account_kind = 'evm_smart_account'
   AND ci.account_id = ? AND ci.initial_security_commitment = ? AND ci.user_salt_commitment = ? AND ci.canonical_address = ?
   AND ai.address = ci.canonical_address AND ai.generation = 3 AND ai.deployment_state = 'active'
   AND ai.deployment_manifest_sha256 = ? AND a.network_id = ? AND i.approval_digest = ? AND i.authorized_at IS NOT NULL
   AND i.profile_sha256 = ? AND i.public_key = ? AND k.public_key = i.public_key AND k.rp_id = ? AND k.origin = ?`,
   values: [...this.auth(), this.identity.expiresAt, c.initializationId, c.walletAccountId, c.walletId,
    o.account_id, o.initial_security_commitment, o.user_salt_commitment, o.address, o.deployment_manifest_sha256, o.network_id,
    i.digest, i.profileDigest, c.source.input.publicKey, c.source.input.scope.rpId, c.source.input.scope.origin] };
 }
 private async decode(row: Row | null) {
  if (!row) throw new WalletAccessError('NOT_FOUND');
  const initializationId = parseResourceId('operation', row.initialization_id);
  const walletId = parseResourceId('wallet', row.wallet_id), walletAccountId = parseResourceId('walletAccount', row.wallet_account_id);
  const c = await this.context(initializationId, walletId, walletAccountId);
  return { ...await restoreActivationAuthorization(row, c.source.input), c };
 }
 private checkpoint(original: BootstrapActivationInput['observation']['checkpoint'], current: BootstrapActivationInput['observation']['checkpoint']) {
  if (BigInt(current.block_number) < BigInt(original.block_number)
   || (current.block_number === original.block_number && current.block_hash !== original.block_hash)) throw new ActivationError('ACTIVATION_STATE_CHANGED');
 }
 private receipt(record: Awaited<ReturnType<ActivationRepository['decode']>>) {
  return Object.freeze({ activation_id: record.id, initialization_id: record.c.initializationId,
   wallet_id: record.c.walletId, wallet_account_id: record.c.walletAccountId,
   state: record.authorizedAt !== null ? 'authorized' as const : now() >= record.input.validUntil ? 'expired' as const : 'prepared' as const,
   proposal_hash: record.prepared.digest, expected_manifest_hash: record.prepared.expectedManifestHash,
   valid_after: record.input.validAfter, valid_until: record.input.validUntil, proposal_valid_until: record.input.proposalValidUntil,
   activation_assessment: 'not_assessed' as const, receive_enabled: false as const, spend_enabled: false as const });
 }
 /** Internal owned restoration for UI composition. No RPC, writes, renewal or private proof
  * disclosure. The original input allows the caller to independently reconstruct challenges. */
 async read(id: ResourceId<'operation'>) {
  parseResourceId('operation', id); await this.wallets.getSession();
  const record = await this.decode(await this.select(id).first<Row>());
  await this.context(record.c.initializationId, record.c.walletId, record.c.walletAccountId);
  return { ...this.receipt(record), input: record.input };
 }
 async prepare(request: Request, signal: AbortSignal) {
  const id = parseResourceId('operation', request.id), initializationId = parseResourceId('operation', request.initializationId);
  const walletId = parseResourceId('wallet', request.walletId), walletAccountId = parseResourceId('walletAccount', request.walletAccountId);
  const nextPolicy = activationPolicy(request.nextPolicy), policyJson = JSON.stringify(nextPolicy);
  const proposalValidUntil = request.proposalValidUntil;
  if (!Number.isSafeInteger(proposalValidUntil)) throw invalid();
  signal.throwIfAborted();
  const c = await this.context(initializationId, walletId, walletAccountId);
  const previous = await this.select(id).first<Row>();
  if (previous) {
   const record = await this.decode(previous);
   if (record.c.initializationId !== initializationId || record.c.walletId !== walletId || record.c.walletAccountId !== walletAccountId
    || previous.policy_json !== policyJson || record.input.proposalValidUntil !== proposalValidUntil) throw new ActivationError('ACTIVATION_CONFLICT');
   if (record.authorizedAt === null && now() >= record.input.validUntil) throw new ActivationError('ACTIVATION_EXPIRED');
   signal.throwIfAborted();
   return this.read(id);
  }
  const observation = await this.observe(c, signal), validAfter = now();
  const input: BootstrapActivationInput = { initialization: c.source.input, nextPolicy, observation, validAfter, validUntil: validAfter + 300, proposalValidUntil };
  const prepared = prepareBootstrapActivation(input, validAfter), snapshotJson = activationSnapshot(observation);
  readActivationSnapshot(snapshotJson, c.source.input);
  signal.throwIfAborted();
  const guard = this.guard(c);
  const result = await this.db.prepare(`INSERT INTO account_activations
   (id,user_id,initialization_id,wallet_id,wallet_account_id,policy_json,snapshot_json,proposal_hash,expected_manifest_hash,created_at,expires_at,proposal_expires_at)
   SELECT ?,u.id,i.id,w.id,a.id,?,?,?,?,?,?,? ${guard.sql} AND unixepoch() < ?
   AND (SELECT count(*) FROM account_activations x WHERE x.user_id = u.id AND x.created_at > ?) < 24
   AND (SELECT count(*) FROM account_activations x WHERE x.user_id = u.id AND x.created_at > ?) < 6
   ON CONFLICT(id) DO NOTHING`).bind(id, policyJson, snapshotJson, prepared.digest, prepared.expectedManifestHash, validAfter, input.validUntil, proposalValidUntil,
    ...guard.values, observation.security_expires_at, validAfter - 86400, validAfter - 600).run();
  if (!result.success || ![0, 1].includes(result.meta.changes)) throw invalid();
  await this.context(initializationId, walletId, walletAccountId); signal.throwIfAborted();
  const stored = await this.select(id).first<Row>();
  if (!stored) {
   if (now() >= observation.security_expires_at) throw new ActivationError('ACTIVATION_STATE_CHANGED');
   throw new ActivationError('ACTIVATION_LIMIT');
  }
  if (stored.initialization_id !== initializationId || stored.wallet_id !== walletId || stored.wallet_account_id !== walletAccountId
   || stored.policy_json !== policyJson || stored.proposal_expires_at !== proposalValidUntil) throw new ActivationError('ACTIVATION_CONFLICT');
  return this.read(id);
 }
 async authorize(id: ResourceId<'operation'>, owner: WebAuthnAssertionBytes, enrollments: readonly ActivationEnrollment[], signal: AbortSignal) {
  parseResourceId('operation', id);
  // Canonical serialization copies every mutable signature buffer before the first await.
  const authorizationJson = activationProofs(owner, enrollments), proof = readActivationProofs(authorizationJson);
  signal.throwIfAborted(); await this.wallets.getSession();
  const record = await this.decode(await this.select(id).first<Row>());
  if (record.authorizedAt !== null) {
   if (record.authorizationJson !== authorizationJson) throw new ActivationError('ACTIVATION_CONFLICT');
   await this.context(record.c.initializationId, record.c.walletId, record.c.walletAccountId);
   signal.throwIfAborted(); return this.receipt(record);
  }
  if (now() >= record.input.validUntil) throw new ActivationError('ACTIVATION_EXPIRED');
  // Reject unrelated/missing proofs before expensive RPC, but do not persist until the
  // fresh chain state and expiry checks below agree with the exact signed proposal.
  let signed: Awaited<ReturnType<typeof authorizeBootstrapActivation>>;
  try { signed = await authorizeBootstrapActivation(record.input, proof.owner, proof.enrollments, now()); }
  catch { throw new ActivationError('INVALID_ACTIVATION_PROOF'); }
  const observation = await this.observe(record.c, signal);
  const current = prepareBootstrapActivation({ ...record.input, observation }, now());
  this.checkpoint(record.input.observation.checkpoint, observation.checkpoint);
  if (current.digest !== record.prepared.digest) throw new ActivationError('ACTIVATION_STATE_CHANGED');
  const authorizedAt = now(), expires = Math.min(record.input.validUntil, observation.security_expires_at);
  if (authorizedAt >= expires) throw new ActivationError('ACTIVATION_EXPIRED');
  const snapshotJson = activationSnapshot(observation); readActivationSnapshot(snapshotJson, record.input.initialization);
  const guard = this.guard(record.c); signal.throwIfAborted();
  const result = await this.db.prepare(`UPDATE account_activations SET authorized_at = ?,authorization_json = ?,authorization_snapshot_json = ?,calldata_sha256 = ?,authorized_auth_time = ?
   WHERE id = ? AND authorized_at IS NULL AND proposal_hash = ? AND unixepoch() < ?
   AND EXISTS (SELECT 1 ${guard.sql})`).bind(authorizedAt, authorizationJson, snapshotJson, deploymentDocumentDigest(signed.data), this.identity.authTime, id,
    signed.proposalHash, expires, ...guard.values).run();
  // D1 counts consent + trigger-inserted outbox + durable scheduling job.
  if (!result.success || ![0, 3].includes(result.meta.changes)) throw invalid();
  const stored = await this.decode(await this.select(id).first<Row>());
  if (stored.authorizedAt === null || stored.authorizationJson !== authorizationJson) throw new ActivationError('ACTIVATION_CONFLICT');
  await this.context(stored.c.initializationId, stored.c.walletId, stored.c.walletAccountId);
  signal.throwIfAborted(); return this.receipt(stored);
 }

 private selectCommit(id: ResourceId<'operation'>) {
  return this.db.prepare(`SELECT c.* FROM account_activation_commits c JOIN account_activations a ON a.id = c.activation_id
   JOIN user_identities u ON u.id = a.user_id WHERE c.id = ? AND ${AUTH}`).bind(id, ...this.auth());
 }
 private async authorizedActivation(id: ResourceId<'operation'>) {
  const activation = await this.decode(await this.select(id).first<Row>());
  if (activation.authorizedAt === null) throw new ActivationError('ACTIVATION_REQUIRED');
  return activation;
 }
 private async decodeCommit(row: Row | null) {
  if (!row) throw new WalletAccessError('NOT_FOUND');
  const activationId = parseResourceId('operation', row.activation_id);
  const activation = await this.authorizedActivation(activationId);
  return { ...await restoreActivationCommitAuthorization(row, activation), activation };
 }
 private commitReceipt(record: Awaited<ReturnType<ActivationRepository['decodeCommit']>>) {
  return Object.freeze({ commit_id: record.id, activation_id: record.activation.id, proposal_hash: record.activation.prepared.digest,
   commit_digest: record.compiled.digest, valid_after: record.validAfter, valid_until: record.validUntil,
   state: record.authorizedAt !== null ? 'authorized' as const : now() >= record.validUntil ? 'expired' as const : 'prepared' as const,
   activation_assessment: 'not_assessed' as const, receive_enabled: false as const, spend_enabled: false as const });
 }
 /** Signing metadata for the same review after reload, never a proof-bearing execution grant. */
 async readCommit(id: ResourceId<'operation'>) {
  parseResourceId('operation', id); await this.wallets.getSession();
  const record = await this.decodeCommit(await this.selectCommit(id).first<Row>());
  await this.context(record.activation.c.initializationId, record.activation.c.walletId, record.activation.c.walletAccountId);
  return { ...this.commitReceipt(record), input: record.activation.input, observation: record.reviewed.observation };
 }
 async prepareCommit(id: ResourceId<'operation'>, activationId: ResourceId<'operation'>, signal: AbortSignal) {
  parseResourceId('operation', id); parseResourceId('operation', activationId); signal.throwIfAborted(); await this.wallets.getSession();
  const activation = await this.authorizedActivation(activationId), previous = await this.selectCommit(id).first<Row>();
  if (previous) {
   const record = await this.decodeCommit(previous);
   if (record.activation.id !== activationId) throw new ActivationError('ACTIVATION_CONFLICT');
   if (record.authorizedAt === null && now() >= record.validUntil) throw new ActivationError('ACTIVATION_EXPIRED');
   signal.throwIfAborted(); return this.readCommit(id);
  }
  if (now() >= activation.input.proposalValidUntil) throw new ActivationError('ACTIVATION_EXPIRED');
  const observed = await this.observe(activation.c, signal), validAfter = now();
  const validUntil = Math.min(validAfter + 300, activation.input.proposalValidUntil);
  const compiled = prepareBootstrapCommit(activation.input, observed, validAfter, validUntil, validAfter);
  const snapshotJson = activationCommitSnapshot(observed); readActivationCommitSnapshot(snapshotJson, activation.input.initialization);
  const guard = this.guard(activation.c); signal.throwIfAborted();
  const result = await this.db.prepare(`INSERT INTO account_activation_commits(id,activation_id,snapshot_json,commit_digest,valid_after,valid_until)
   SELECT ?,?,?,?, ?,? ${guard.sql} AND unixepoch() < ? AND unixepoch() < ?
   AND EXISTS (SELECT 1 FROM account_activations x WHERE x.id = ? AND x.user_id = u.id AND x.proposal_hash = ? AND x.authorization_json = ?)
   AND (SELECT count(*) FROM account_activation_commits z JOIN account_activations x ON x.id = z.activation_id
    WHERE x.user_id = u.id AND z.valid_after > ?) < 6
   ON CONFLICT(id) DO NOTHING`).bind(id, activationId, snapshotJson, compiled.digest, validAfter, validUntil, ...guard.values,
    observed.security_expires_at, validUntil, activationId, activation.prepared.digest, activation.authorizationJson, validAfter - 600).run();
  if (!result.success || ![0, 1].includes(result.meta.changes)) throw invalid();
  await this.context(activation.c.initializationId, activation.c.walletId, activation.c.walletAccountId); signal.throwIfAborted();
  const stored = await this.selectCommit(id).first<Row>();
  if (!stored) throw new ActivationError(now() >= Math.min(observed.security_expires_at, validUntil) ? 'ACTIVATION_EXPIRED' : 'ACTIVATION_LIMIT');
  if (stored.activation_id !== activationId) throw new ActivationError('ACTIVATION_CONFLICT');
  return this.readCommit(id);
 }
 async authorizeCommit(id: ResourceId<'operation'>, assertion: WebAuthnAssertionBytes, signal: AbortSignal) {
  parseResourceId('operation', id);
  const body = writeAssertionRecord(assertion), proof = readAssertionRecord(body);
  signal.throwIfAborted(); await this.wallets.getSession();
  const record = await this.decodeCommit(await this.selectCommit(id).first<Row>()), activation = record.activation;
  if (record.authorizedAt !== null) {
   if (record.assertionBody !== body) throw new ActivationError('ACTIVATION_CONFLICT');
   await this.context(activation.c.initializationId, activation.c.walletId, activation.c.walletAccountId);
   signal.throwIfAborted(); return this.commitReceipt(record);
  }
  if (now() >= record.validUntil) throw new ActivationError('ACTIVATION_EXPIRED');
  let signed: ReturnType<typeof authorizeBootstrapCommit>;
  try { signed = authorizeBootstrapCommit(activation.input, record.reviewed.observation, record.validAfter, record.validUntil, proof, now()); }
  catch { throw new ActivationError('INVALID_ACTIVATION_PROOF'); }
  const observed = await this.observe(activation.c, signal, record.reviewed.finalityEvidence.target);
  prepareBootstrapCommit(activation.input, observed, record.validAfter, record.validUntil, now());
  this.checkpoint(record.reviewed.observation.checkpoint, observed.checkpoint);
  const confirmationJson = JSON.stringify({ current: activationCommitSnapshot(observed), acknowledgement: observed.acknowledgement });
  readActivationCommitConfirmation(confirmationJson, activation.input.initialization, record.reviewed);
  const authorizedAt = now(), expires = Math.min(record.validUntil, observed.security_expires_at);
  if (authorizedAt >= expires) throw new ActivationError('ACTIVATION_EXPIRED');
  const guard = this.guard(activation.c); signal.throwIfAborted();
  const result = await this.db.prepare(`UPDATE account_activation_commits SET authorized_at = ?,assertion_body = ?,confirmation_json = ?,calldata_sha256 = ?,authorized_auth_time = ?
   WHERE id = ? AND authorized_at IS NULL AND commit_digest = ? AND unixepoch() < ?
   AND EXISTS (SELECT 1 ${guard.sql}) AND EXISTS (SELECT 1 FROM account_activations x WHERE x.id = account_activation_commits.activation_id
    AND x.id = ? AND x.proposal_hash = ? AND x.authorization_json = ?)`).bind(authorizedAt, body, confirmationJson, deploymentDocumentDigest(signed.data), this.identity.authTime, id,
    record.compiled.digest, expires, ...guard.values, activation.id, activation.prepared.digest, activation.authorizationJson).run();
  if (!result.success || ![0, 3].includes(result.meta.changes)) throw invalid();
  const stored = await this.decodeCommit(await this.selectCommit(id).first<Row>());
  if (stored.authorizedAt === null || stored.assertionBody !== body) throw new ActivationError('ACTIVATION_CONFLICT');
  await this.context(activation.c.initializationId, activation.c.walletId, activation.c.walletAccountId);
  signal.throwIfAborted(); return this.commitReceipt(stored);
 }
}
