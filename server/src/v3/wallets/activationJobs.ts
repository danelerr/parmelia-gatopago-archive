import { createResourceId, parseResourceId, type ResourceId } from '../../../../shared/v3/primitives';
import { ActivationDeliveryRepository } from './activationDelivery';
import type { CreationDeliveryConfiguration } from './creationDelivery';
import type { ActivationJobOutcome } from './processActivationJob';

export interface ActivationWake {
 readonly schema_version: 1;
 readonly kind: 'account_activation';
 readonly operation_id: ResourceId<'operation'>;
 readonly token: ResourceId<'operation'>;
}
export function parseActivationWake(value: unknown): ActivationWake {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 4
  || Reflect.get(value, 'schema_version') !== 1 || Reflect.get(value, 'kind') !== 'account_activation') throw new Error('INVALID_ACTIVATION_WAKE');
 return Object.freeze({ schema_version: 1, kind: 'account_activation', operation_id: parseResourceId('operation', Reflect.get(value, 'operation_id')),
  token: parseResourceId('operation', Reflect.get(value, 'token')) });
}
const now = () => Math.floor(Date.now() / 1000);
const changed = (r: D1Result) => {
 if (!r.success || ![0, 1].includes(r.meta.changes)) throw new Error('ACTIVATION_JOB_STORAGE');
 return r.meta.changes === 1;
};
/** Scoped queue hints. All mutations fence by token and SQLite lease time; proofs,
 * provider URLs and signer authority never travel in messages. */
export class ActivationJobRepository {
 private readonly db: D1DatabaseSession;
 private readonly project: string;
 private readonly pins: readonly string[];
 constructor(database: D1Database, configuration: CreationDeliveryConfiguration) {
  new ActivationDeliveryRepository(database, configuration);
  this.db = database.withSession('first-primary'); this.project = configuration.firebaseProjectId;
  this.pins = Object.freeze(configuration.profiles.map((p) => p.digest));
 }
 private scope() {
  return `EXISTS (SELECT 1 FROM account_activation_outbox b JOIN account_activations a ON a.id = b.activation_id
   JOIN account_initializations i ON i.id = a.initialization_id JOIN user_identities u ON u.id = a.user_id
   WHERE b.operation_id = account_activation_jobs.operation_id AND u.firebase_project_id = ?
   AND i.profile_sha256 IN (${this.pins.map(() => '?').join(',')}))`;
 }
 async due(limit = 20) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('INVALID_ACTIVATION_SWEEP');
  if (!this.pins.length) return [];
  const r = await this.db.prepare(`SELECT operation_id FROM account_activation_jobs WHERE state IN ('ready','queued','running')
   AND next_attempt_at <= unixepoch() AND (lease_expires_at IS NULL OR lease_expires_at <= unixepoch()) AND ${this.scope()}
   ORDER BY next_attempt_at,operation_id LIMIT ?`).bind(this.project, ...this.pins, limit).all<{ operation_id: string }>();
  if (!r.success) throw new Error('ACTIVATION_JOB_STORAGE');
  return r.results.map((x) => parseResourceId('operation', x.operation_id));
 }
 async reserve(id: ResourceId<'operation'>): Promise<ActivationWake | null> {
  parseResourceId('operation', id); if (!this.pins.length) return null;
  const token = createResourceId('operation');
  return changed(await this.db.prepare(`UPDATE account_activation_jobs SET state = 'queued',lease_token = ?,lease_expires_at = unixepoch() + 120
   WHERE operation_id = ? AND state IN ('ready','queued','running') AND next_attempt_at <= unixepoch()
   AND (lease_expires_at IS NULL OR lease_expires_at <= unixepoch()) AND ${this.scope()}`)
   .bind(token, id, this.project, ...this.pins).run()) ? Object.freeze({ schema_version: 1, kind: 'account_activation', operation_id: id, token }) : null;
 }
 async claim(input: ActivationWake) {
  const m = parseActivationWake(input); if (!this.pins.length) return false;
  return changed(await this.db.prepare(`UPDATE account_activation_jobs SET state = 'running',lease_expires_at = unixepoch() + 180
   WHERE operation_id = ? AND lease_token = ? AND state = 'queued' AND lease_expires_at > unixepoch() AND ${this.scope()}`)
   .bind(m.operation_id, m.token, this.project, ...this.pins).run());
 }
 async finish(input: ActivationWake, outcome: ActivationJobOutcome) {
  const m = parseActivationWake(input); if (!this.pins.length) return false;
  const time = now(), next = outcome.state === 'ready' ? outcome.next : time;
  if (!Number.isSafeInteger(next) || next < time || next > time + 3600) throw new Error('INVALID_ACTIVATION_RETRY');
  return changed(await this.db.prepare(`UPDATE account_activation_jobs SET state = ?,next_attempt_at = ?,failures = 0,
   lease_token = NULL,lease_expires_at = NULL,reason = ? WHERE operation_id = ? AND lease_token = ?
   AND state = 'running' AND lease_expires_at > unixepoch() AND ${this.scope()}`)
   .bind(outcome.state, next, outcome.state === 'ready' ? null : outcome.reason, m.operation_id, m.token, this.project, ...this.pins).run());
 }
 async fail(input: ActivationWake, state: 'queued' | 'running') {
  const m = parseActivationWake(input); if (!this.pins.length) return false;
  return changed(await this.db.prepare(`UPDATE account_activation_jobs SET state = CASE WHEN failures >= 7 THEN 'review' ELSE 'ready' END,
   reason = CASE WHEN failures >= 7 THEN 'processing_error' ELSE NULL END,
   next_attempt_at = unixepoch() + min(3600,30 * (1 << failures)),failures = min(8,failures + 1),lease_token = NULL,lease_expires_at = NULL
   WHERE operation_id = ? AND lease_token = ? AND state = ? AND lease_expires_at > unixepoch() AND ${this.scope()}`)
   .bind(m.operation_id, m.token, state, this.project, ...this.pins).run());
 }
}
