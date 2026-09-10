-- Historical evidence of the authorized active policy, NOT a durable spend permit.
CREATE TABLE account_activation_projections (
 operation_id TEXT PRIMARY KEY REFERENCES account_activation_outbox(operation_id) ON DELETE CASCADE,
 activation_id TEXT NOT NULL REFERENCES account_activations(id) ON DELETE RESTRICT,
 source_epoch INTEGER NOT NULL CHECK (source_epoch > 0),
 source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 66),
 transaction_hash TEXT NOT NULL CHECK (length(transaction_hash) = 66),
 profile_sha256 TEXT NOT NULL CHECK (length(profile_sha256) = 66),
 manifest_hash TEXT NOT NULL CHECK (length(manifest_hash) = 66),
 security_json TEXT NOT NULL CHECK (json_valid(security_json) AND length(security_json) <= 16384),
 security_sha256 TEXT NOT NULL CHECK (length(security_sha256) = 66),
 projected_at INTEGER NOT NULL CHECK (projected_at > 0),
 evidence_expires_at INTEGER NOT NULL CHECK (evidence_expires_at > projected_at)
) STRICT;
CREATE TRIGGER account_activation_projection_immutable BEFORE UPDATE ON account_activation_projections
BEGIN SELECT RAISE(ABORT, 'Activation projection is immutable'); END;
