-- One immutable, separately signed ERC-4337 candidate per initialization consent.
-- This durable outbox is an intent to deliver, NOT bundler acceptance or chain evidence.
CREATE TABLE account_creation_operations (
  initialization_id TEXT PRIMARY KEY REFERENCES account_initializations(id) ON DELETE RESTRICT,
  gas_terms_json TEXT NOT NULL CHECK (length(gas_terms_json) <= 1024 AND json_valid(gas_terms_json)),
  user_op_hash TEXT NOT NULL CHECK (length(user_op_hash) = 66),
  operation_digest TEXT NOT NULL CHECK (length(operation_digest) = 66),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at AND expires_at <= created_at + 300),
  authorized_at INTEGER,
  authorized_auth_time INTEGER,
  assertion_body TEXT,
  operation_signature TEXT,
  CHECK ((authorized_at IS NULL AND authorized_auth_time IS NULL AND assertion_body IS NULL AND operation_signature IS NULL) OR
    (authorized_at IS NOT NULL AND authorized_at >= created_at AND authorized_at < expires_at
      AND authorized_auth_time IS NOT NULL AND authorized_auth_time >= 0
      AND assertion_body IS NOT NULL AND length(assertion_body) <= 7000 AND json_valid(assertion_body)
      AND operation_signature IS NOT NULL AND length(operation_signature) BETWEEN 2 AND 16386))
) STRICT;

CREATE TABLE account_creation_outbox (
  initialization_id TEXT PRIMARY KEY REFERENCES account_creation_operations(initialization_id) ON DELETE RESTRICT,
  user_op_hash TEXT NOT NULL CHECK (length(user_op_hash) = 66),
  state TEXT NOT NULL CHECK (state IN ('pending','sending','uncertain','accepted','expired')),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at AND expires_at <= created_at + 300),
  lease_token TEXT,
  lease_expires_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 32),
  next_attempt_at INTEGER NOT NULL DEFAULT 0 CHECK (next_attempt_at >= 0),
  send_started_at INTEGER,
  accepted_at INTEGER,
  CHECK ((lease_token IS NULL AND lease_expires_at IS NULL) OR
    (lease_token IS NOT NULL AND length(lease_token) = 39 AND lease_expires_at IS NOT NULL
      AND lease_expires_at > created_at AND lease_expires_at <= expires_at AND state IN ('pending','sending'))),
  CHECK ((state IN ('sending','uncertain','accepted') AND send_started_at IS NOT NULL
    AND send_started_at >= created_at AND send_started_at < expires_at AND attempt_count >= 1) OR
    (state IN ('pending','expired') AND send_started_at IS NULL)),
  CHECK (state <> 'sending' OR lease_token IS NOT NULL),
  CHECK ((state = 'accepted' AND accepted_at IS NOT NULL AND accepted_at >= send_started_at) OR
    (state <> 'accepted' AND accepted_at IS NULL))
) STRICT;
CREATE INDEX account_creation_outbox_pending ON account_creation_outbox(state, next_attempt_at, initialization_id);
