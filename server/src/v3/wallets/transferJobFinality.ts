import { deploymentDocumentDigest } from '../../../../shared/v3/deployment';
import { prepareTransferFinalityEvidence } from './transferFinalityEvidence';
import { TransferJobRepository, parseTransferWake, type TransferWake } from './transferJobs';
import { observeTransferJob } from './transferObservation';
import { writeTransferReview } from './transferReviewRecord';
import { writeTransferOperationRecord } from './transferOperationRecord';

/** Leased historical observation, independent of the user's login lifetime.
 * Never accepts external receipts; the observer is invoked inside this boundary.
 * Journal and first-conflict capture share one D1 transaction. No hold release.
 */
export async function recordTransferJobFinality(database: D1Database, firebaseProjectId: string, input: TransferWake,
  profilesInput: Parameters<typeof observeTransferJob>[3], signal: AbortSignal) {
  const message = parseTransferWake(input), profiles = structuredClone(profilesInput), started = Math.floor(Date.now() / 1000);
  const jobs = new TransferJobRepository(database, { firebaseProjectId, profiles });
  const original = await jobs.observationSource(message);
  const result = await observeTransferJob(database, firebaseProjectId, message, profiles, signal);
  signal.throwIfAborted();
  if (result.status !== 'observed' || result.finality_evidence.status !== 'finalized') {
    return Object.freeze({ ...result, journal: 'not_recorded' as const });
  }
  const current = await jobs.observationSource(message), now = Math.floor(Date.now() / 1000);
  if (current.context !== original.context) throw new Error('TRANSFER_JOB_CHANGED');
  const { receiptJson, receiptDigest, evidenceJson, evidenceDigest } =
    prepareTransferFinalityEvidence(current.record, message.operation_id, result, profiles, started, now);
  const candidate = current.record.candidate;
  const review = writeTransferReview(current.record.review);
  const operation = writeTransferOperationRecord(current.record.operation, { network_id: candidate.request.network_id,
    account: candidate.account, account_id: candidate.plan.accountId, entry_point: candidate.plan.entryPoint,
    userop_hash: candidate.userOpHash, consent_digest: candidate.digest, valid_until: candidate.plan.validUntil });
  const from = `FROM transfer_nonce_reservations r JOIN transfer_jobs t ON t.operation_id = r.id
    JOIN wallets w ON w.id = r.wallet_id JOIN parties p ON p.id = w.owner_party_id JOIN user_identities u ON u.id = p.user_id
    JOIN wallet_accounts a ON a.id = r.wallet_account_id AND a.wallet_id = r.wallet_id AND a.network_id = r.network_id
    JOIN account_identities c ON c.id = a.account_identity_id AND c.wallet_id = r.wallet_id AND c.canonical_address = r.account_address`;
  const where = `r.id = ? AND t.lease_token = ? AND t.state = 'running' AND t.lease_expires_at > unixepoch()
    AND r.state = 'delivery_pending' AND r.userop_hash = ? AND r.consent_digest = ? AND r.review_sha256 = ?
    AND r.operation_sha256 = ? AND u.firebase_project_id = ? AND r.deployment_manifest_sha256 = ?
    AND c.initial_security_commitment = ? AND c.user_salt_commitment = ?`;
  const access = [message.operation_id, message.token, candidate.userOpHash, candidate.digest, review.digest,
    operation.digest, firebaseProjectId, candidate.deployment_digest, current.initialSecurityCommitment, current.userSaltCommitment];
  const values = [receiptJson, receiptDigest, evidenceJson, evidenceDigest, now];
  const db = database.withSession('first-primary');
  signal.throwIfAborted();
  const writes = await db.batch<Record<string, unknown>>([
    db.prepare(`INSERT INTO transfer_finality_journal (operation_id,receipt_json,receipt_sha256,evidence_json,evidence_sha256,recorded_at)
      SELECT r.id,?,?,?,?,? ${from} WHERE ${where} ON CONFLICT(operation_id) DO NOTHING`).bind(...values, ...access),
    db.prepare(`INSERT INTO transfer_finality_conflicts (operation_id,receipt_json,receipt_sha256,evidence_json,evidence_sha256,recorded_at)
      SELECT r.id,?,?,?,?,? ${from} JOIN transfer_finality_journal j ON j.operation_id = r.id
      WHERE ${where} AND (j.receipt_json != ? OR j.receipt_sha256 != ?) ON CONFLICT(operation_id) DO NOTHING`)
      .bind(...values, ...access, receiptJson, receiptDigest),
    db.prepare('SELECT * FROM transfer_finality_journal WHERE operation_id = ?').bind(message.operation_id),
    db.prepare('SELECT * FROM transfer_finality_conflicts WHERE operation_id = ?').bind(message.operation_id),
  ]);
  const after = await jobs.observationSource(message);
  signal.throwIfAborted();
  if (after.context !== original.context || writes.some(row => !row.success)
    || writes.slice(0, 2).some(row => ![0, 1].includes(row.meta.changes))) throw new Error('TRANSFER_JOB_CHANGED');
  const saved = writes[2].results[0], conflict = writes[3].results[0];
  for (const row of [saved, ...(conflict ? [conflict] : [])]) {
    if (!row || typeof row.receipt_json !== 'string' || typeof row.evidence_json !== 'string'
      || deploymentDocumentDigest(row.receipt_json) !== row.receipt_sha256
      || deploymentDocumentDigest(row.evidence_json) !== row.evidence_sha256) throw new Error('TRANSFER_JOB_JOURNAL');
  }
  return Object.freeze({ ...result, journal: !conflict && saved.receipt_json === receiptJson && saved.receipt_sha256 === receiptDigest
    ? 'recorded' as const : 'conflict' as const });
}
