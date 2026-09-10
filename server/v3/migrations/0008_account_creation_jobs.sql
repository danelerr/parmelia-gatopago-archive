-- Wake-up/processing leases are NOT signing authority. The immutable operation
-- grant stays in account_creation_operations and is reverified before every send.
CREATE TABLE account_creation_jobs (
  initialization_id TEXT PRIMARY KEY REFERENCES account_creation_outbox(initialization_id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','queued','running','complete','review')),
  next_attempt_at INTEGER NOT NULL DEFAULT 0 CHECK (next_attempt_at >= 0),
  lease_token TEXT,
  lease_expires_at INTEGER,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 8),
  reason TEXT CHECK (reason IN ('projected','expired','revoked','execution_reverted','observation_timeout','processing_error')),
  CHECK ((state IN ('queued','running') AND lease_token IS NOT NULL AND length(lease_token) = 39 AND lease_expires_at IS NOT NULL AND lease_expires_at > 0)
    OR (state NOT IN ('queued','running') AND lease_token IS NULL AND lease_expires_at IS NULL)),
  CHECK ((state IN ('complete','review') AND reason IS NOT NULL) OR (state NOT IN ('complete','review') AND reason IS NULL))
) STRICT;
CREATE INDEX account_creation_jobs_due ON account_creation_jobs(next_attempt_at, initialization_id)
  WHERE state IN ('ready','queued','running');
-- The job and outbox commit with authorization; no HTTP callback is needed for
-- durability. Existing local candidates also get a recoverable wake-up.
INSERT INTO account_creation_jobs(initialization_id) SELECT initialization_id FROM account_creation_outbox;
