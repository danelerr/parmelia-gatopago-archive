-- Durable scheduling is derived from authorized outbox work, never new authority.
CREATE TABLE account_activation_jobs (
 operation_id TEXT PRIMARY KEY REFERENCES account_activation_outbox(operation_id) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','queued','running','observed','expired','review')),
 next_attempt_at INTEGER NOT NULL CHECK (next_attempt_at >= 0),
 lease_token TEXT,
 lease_expires_at INTEGER,
 failures INTEGER NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 8),
 reason TEXT CHECK (reason IS NULL OR reason IN ('proposal_finalized','commit_finalized','consent_expired',
  'revoked','execution_reverted','observation_timeout','reorg_detected','delivery_exhausted','processing_error')),
 CHECK ((state IN ('queued','running') AND lease_token IS NOT NULL AND length(lease_token) = 39
  AND lease_token GLOB 'op_*' AND lease_expires_at IS NOT NULL AND lease_expires_at > 0)
  OR (state NOT IN ('queued','running') AND lease_token IS NULL AND lease_expires_at IS NULL)),
 CHECK ((state IN ('ready','queued','running') AND reason IS NULL)
  OR (state = 'observed' AND reason IS NOT NULL AND reason IN ('proposal_finalized','commit_finalized'))
  OR (state = 'expired' AND reason IS NOT NULL AND reason = 'consent_expired')
  OR (state = 'review' AND reason IS NOT NULL AND reason IN ('revoked','execution_reverted','observation_timeout','reorg_detected','delivery_exhausted','processing_error')))
) STRICT;
CREATE INDEX account_activation_jobs_due ON account_activation_jobs(state,next_attempt_at,operation_id);
CREATE TRIGGER account_activation_job_enqueue AFTER INSERT ON account_activation_outbox
BEGIN
 INSERT INTO account_activation_jobs(operation_id,next_attempt_at) VALUES (NEW.operation_id,NEW.created_at);
END;
INSERT INTO account_activation_jobs(operation_id,next_attempt_at)
 SELECT operation_id,created_at FROM account_activation_outbox;
