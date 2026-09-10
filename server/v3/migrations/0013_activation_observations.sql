-- Read-only observation of previously sent activation transactions. Never changes
-- send authority, nonce reservations or account readiness; no remote admission.
CREATE TABLE account_activation_observation_jobs (
 operation_id TEXT PRIMARY KEY REFERENCES account_activation_transactions(operation_id) ON DELETE RESTRICT,
 lease_epoch INTEGER NOT NULL DEFAULT 0 CHECK (lease_epoch >= 0),
 lease_token TEXT,
 lease_started_at INTEGER,
 lease_expires_at INTEGER,
 next_poll_at INTEGER NOT NULL DEFAULT 0 CHECK (next_poll_at >= 0),
 latest_epoch INTEGER NOT NULL DEFAULT 0 CHECK (latest_epoch >= 0 AND latest_epoch <= lease_epoch),
 CHECK ((lease_token IS NULL AND lease_started_at IS NULL AND lease_expires_at IS NULL) OR
  (lease_token IS NOT NULL AND length(lease_token) = 39 AND lease_started_at IS NOT NULL
   AND lease_started_at > 0 AND lease_expires_at = lease_started_at + 60))
) STRICT;
CREATE INDEX account_activation_observation_due ON account_activation_observation_jobs(next_poll_at, operation_id);

CREATE TABLE account_activation_observations (
 operation_id TEXT NOT NULL REFERENCES account_activation_observation_jobs(operation_id) ON DELETE RESTRICT,
 lease_epoch INTEGER NOT NULL CHECK (lease_epoch > 0),
 lease_token TEXT NOT NULL UNIQUE CHECK (length(lease_token) = 39),
 started_at INTEGER NOT NULL CHECK (started_at > 0),
 observed_at INTEGER NOT NULL CHECK (observed_at >= started_at AND observed_at < started_at + 60),
 transaction_hash TEXT NOT NULL CHECK (length(transaction_hash) = 66),
 status TEXT NOT NULL CHECK (status IN ('observed','not_observed','unavailable','disagreement')),
 result_json TEXT NOT NULL CHECK (length(result_json) <= 8192 AND json_valid(result_json)),
 result_sha256 TEXT NOT NULL CHECK (length(result_sha256) = 66),
 CHECK (json_extract(result_json, '$.status') IS status),
 CHECK (json_extract(result_json, '$.transaction_hash') IS transaction_hash),
 CHECK (json_extract(result_json, '$.account_readiness') IS 'not_assessed'),
 CHECK (json_extract(result_json, '$.finality') IS NOT NULL AND json_extract(result_json, '$.finality') IN
  ('not_assessed','finalized','pending','stale','disagreement','reorg_detected','unavailable')),
 CHECK ((status <> 'observed' AND json_extract(result_json, '$.finality') IS 'not_assessed') OR
  (status = 'observed' AND json_extract(result_json, '$.observation.transaction_hash') IS transaction_hash
   AND json_extract(result_json, '$.observation.operation_id') IS operation_id
   AND json_extract(result_json, '$.finality_evidence.status') IS json_extract(result_json, '$.finality'))),
 PRIMARY KEY (operation_id, lease_epoch)
) STRICT;
CREATE INDEX account_activation_finalized_history ON account_activation_observations
 (operation_id, json_extract(result_json, '$.finality'), lease_epoch DESC);
CREATE TRIGGER account_activation_observations_no_update BEFORE UPDATE ON account_activation_observations BEGIN
 SELECT RAISE(ABORT, 'Activation observations are append-only');
END;
