-- A durable observation obligation, not permission to broadcast or release funds.
CREATE TABLE transfer_jobs (
 operation_id TEXT PRIMARY KEY REFERENCES transfer_nonce_reservations(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK (state IN ('ready','queued','running','reconciled','review')),
 next_attempt_at INTEGER NOT NULL CHECK (next_attempt_at >= 0),
 lease_token TEXT,
 lease_expires_at INTEGER,
 failures INTEGER NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 8),
 reason TEXT CHECK (reason IS NULL OR reason IN ('processing_error','observation_timeout','conflicting_evidence')),
 CHECK ((state IN ('queued','running') AND lease_token IS NOT NULL AND length(lease_token) = 39
   AND lease_token GLOB 'op_*' AND lease_expires_at IS NOT NULL AND lease_expires_at > 0)
   OR (state NOT IN ('queued','running') AND lease_token IS NULL AND lease_expires_at IS NULL)),
 CHECK ((state = 'review' AND reason IS NOT NULL) OR (state != 'review' AND reason IS NULL))
) STRICT;
CREATE INDEX transfer_jobs_due ON transfer_jobs(state,next_attempt_at,operation_id);
CREATE TRIGGER transfer_job_enqueue AFTER UPDATE OF state ON transfer_nonce_reservations
WHEN OLD.state = 'held' AND NEW.state = 'delivery_pending'
BEGIN
 INSERT INTO transfer_jobs(operation_id,state,next_attempt_at) VALUES (NEW.id,'ready',unixepoch());
END;
CREATE TRIGGER transfer_job_reconciled AFTER UPDATE OF state ON transfer_nonce_reservations
WHEN NEW.state = 'reconciled' AND OLD.state != NEW.state
BEGIN
 UPDATE transfer_jobs SET state = 'reconciled', lease_token = NULL, lease_expires_at = NULL, reason = NULL
 WHERE operation_id = NEW.id;
END;
-- Local candidate migrations may be applied to an existing V3 test database.
INSERT INTO transfer_jobs(operation_id,state,next_attempt_at)
 SELECT id, CASE WHEN state = 'reconciled' THEN 'reconciled' ELSE 'ready' END, unixepoch()
 FROM transfer_nonce_reservations WHERE state IN ('delivery_pending','reconciled');
