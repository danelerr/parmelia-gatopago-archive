-- Local V3 candidate only. Old testnet consent is NOT silently granted execution.
ALTER TABLE account_activations ADD COLUMN authorized_auth_time INTEGER CHECK (authorized_auth_time > 0);
ALTER TABLE account_activation_commits ADD COLUMN authorized_auth_time INTEGER CHECK (authorized_auth_time > 0);

CREATE TABLE account_activation_outbox (
 operation_id TEXT PRIMARY KEY CHECK (length(operation_id) = 39 AND operation_id GLOB 'op_*'),
 activation_id TEXT NOT NULL REFERENCES account_activations(id) ON DELETE RESTRICT,
 commit_id TEXT UNIQUE REFERENCES account_activation_commits(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK (kind IN ('prepare','commit')),
 calldata_sha256 TEXT NOT NULL CHECK (length(calldata_sha256) = 66),
 authorized_auth_time INTEGER NOT NULL CHECK (authorized_auth_time > 0),
 created_at INTEGER NOT NULL CHECK (created_at >= authorized_auth_time),
 expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','uncertain','accepted','expired')),
 attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 32),
 next_attempt_at INTEGER NOT NULL CHECK (next_attempt_at >= created_at),
 lease_token TEXT,
 lease_expires_at INTEGER,
 send_started_at INTEGER,
 transaction_hash TEXT CHECK (transaction_hash IS NULL OR (length(transaction_hash) = 66 AND substr(transaction_hash,1,2) = '0x' AND substr(transaction_hash,3) NOT GLOB '*[^0-9a-f]*')),
 accepted_at INTEGER,
 CHECK ((kind = 'prepare' AND commit_id IS NULL AND operation_id = activation_id)
  OR (kind = 'commit' AND commit_id IS NOT NULL AND operation_id = commit_id)),
 CHECK ((lease_token IS NULL AND lease_expires_at IS NULL)
  OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND length(lease_token) = 39 AND lease_token GLOB 'op_*' AND lease_expires_at > 0)),
 CHECK ((state IN ('pending','expired') AND send_started_at IS NULL AND transaction_hash IS NULL AND accepted_at IS NULL)
  OR (state = 'sending' AND send_started_at IS NOT NULL AND lease_token IS NOT NULL AND accepted_at IS NULL)
  OR (state = 'uncertain' AND send_started_at IS NOT NULL AND lease_token IS NULL AND accepted_at IS NULL)
  OR (state = 'accepted' AND send_started_at IS NOT NULL AND transaction_hash IS NOT NULL AND accepted_at IS NOT NULL AND lease_token IS NULL)),
 CHECK (state != 'expired' OR lease_token IS NULL)
) STRICT;
CREATE INDEX account_activation_outbox_due ON account_activation_outbox(state,next_attempt_at,operation_id);

CREATE TRIGGER account_activation_outbox_identity BEFORE UPDATE ON account_activation_outbox
WHEN NEW.operation_id IS NOT OLD.operation_id OR NEW.activation_id IS NOT OLD.activation_id OR NEW.commit_id IS NOT OLD.commit_id
 OR NEW.kind IS NOT OLD.kind OR NEW.calldata_sha256 IS NOT OLD.calldata_sha256 OR NEW.authorized_auth_time IS NOT OLD.authorized_auth_time
 OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
 OR NEW.attempt_count < OLD.attempt_count
 OR (OLD.send_started_at IS NOT NULL AND NEW.send_started_at IS NOT OLD.send_started_at)
 OR (OLD.transaction_hash IS NOT NULL AND NEW.transaction_hash IS NOT OLD.transaction_hash)
 OR (OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS NOT OLD.accepted_at)
 OR (OLD.state = 'pending' AND NEW.state NOT IN ('pending','sending','expired'))
 OR (OLD.state IN ('uncertain','accepted','expired') AND NEW.state IS NOT OLD.state)
 OR (OLD.state = 'sending' AND NEW.state NOT IN ('sending','uncertain','accepted'))
BEGIN SELECT RAISE(ABORT, 'Activation delivery identity/transition is immutable'); END;

-- Trigger insertion shares the SAME SQLite transaction as the authorization update.
-- A lost HTTP response or failed wake-up cannot leave signed consent without durable work.
-- No broad catch/ignore: insert failure must roll back the signature too.
CREATE TRIGGER account_activation_enqueue AFTER UPDATE ON account_activations
WHEN OLD.authorized_at IS NULL AND NEW.authorized_at IS NOT NULL
BEGIN
 INSERT INTO account_activation_outbox(operation_id,activation_id,kind,calldata_sha256,authorized_auth_time,created_at,expires_at,next_attempt_at)
 VALUES (NEW.id,NEW.id,'prepare',NEW.calldata_sha256,NEW.authorized_auth_time,NEW.authorized_at,NEW.expires_at,NEW.authorized_at);
END;
CREATE TRIGGER account_activation_commit_enqueue AFTER UPDATE ON account_activation_commits
WHEN OLD.authorized_at IS NULL AND NEW.authorized_at IS NOT NULL
BEGIN
 INSERT INTO account_activation_outbox(operation_id,activation_id,commit_id,kind,calldata_sha256,authorized_auth_time,created_at,expires_at,next_attempt_at)
 VALUES (NEW.id,NEW.activation_id,NEW.id,'commit',NEW.calldata_sha256,NEW.authorized_auth_time,NEW.authorized_at,NEW.valid_until,NEW.authorized_at);
END;
