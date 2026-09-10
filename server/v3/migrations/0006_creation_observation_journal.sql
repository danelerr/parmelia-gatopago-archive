-- Read-only reconciliation has its own lease. Never changes a send marker or
-- account readiness. No profile is admitted and no remote resource is activated.
CREATE TABLE account_creation_observation_jobs (
  initialization_id TEXT PRIMARY KEY REFERENCES account_creation_operations(initialization_id) ON DELETE RESTRICT,
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
CREATE INDEX account_creation_observation_due ON account_creation_observation_jobs(next_poll_at, initialization_id);

-- Append-only through the repository; uncertainty and changed/orphaned evidence
-- append a new observation instead of editing the historical record.
CREATE TABLE account_creation_observations (
  initialization_id TEXT NOT NULL REFERENCES account_creation_observation_jobs(initialization_id) ON DELETE RESTRICT,
  lease_epoch INTEGER NOT NULL CHECK (lease_epoch > 0),
  lease_token TEXT NOT NULL UNIQUE CHECK (length(lease_token) = 39),
  started_at INTEGER NOT NULL CHECK (started_at > 0),
  observed_at INTEGER NOT NULL CHECK (observed_at >= started_at AND observed_at < started_at + 60),
  user_op_hash TEXT NOT NULL CHECK (length(user_op_hash) = 66),
  status TEXT NOT NULL CHECK (status IN ('observed','not_observed','unavailable','disagreement')),
  transaction_hash TEXT CHECK (transaction_hash IS NULL OR length(transaction_hash) = 66),
  result_json TEXT NOT NULL CHECK (length(result_json) <= 8192 AND json_valid(result_json)),
  result_sha256 TEXT NOT NULL CHECK (length(result_sha256) = 66),
  CHECK (json_extract(result_json, '$.status') IS status),
  CHECK (json_extract(result_json, '$.transaction_hash') IS transaction_hash),
  CHECK (json_extract(result_json, '$.finality') IS NOT NULL AND json_extract(result_json, '$.finality') IN ('not_assessed','finalized','pending','stale','disagreement','reorg_detected','unavailable')),
  CHECK (json_extract(result_json, '$.finality') IS 'not_assessed' OR
    (status = 'observed' AND json_extract(result_json, '$.finality_evidence.status') IS json_extract(result_json, '$.finality'))),
  CHECK (json_extract(result_json, '$.account_readiness') IS 'not_assessed'),
  CHECK (status <> 'observed' OR (transaction_hash IS NOT NULL
    AND json_extract(result_json, '$.observation.user_op_hash') IS user_op_hash)),
  PRIMARY KEY (initialization_id, lease_epoch)
) STRICT;
CREATE INDEX account_creation_finalized_history ON account_creation_observations
  (initialization_id, json_extract(result_json, '$.finality'), lease_epoch DESC);
CREATE TRIGGER account_creation_observations_no_update
BEFORE UPDATE ON account_creation_observations BEGIN
  SELECT RAISE(ABORT, 'Creation observations are append-only');
END;
