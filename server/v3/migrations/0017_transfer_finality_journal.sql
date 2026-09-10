-- Unreleased V3: immutable finalized evidence, not a balance projection or release.
CREATE TABLE transfer_finality_journal (
 operation_id TEXT PRIMARY KEY REFERENCES transfer_nonce_reservations(id) ON DELETE RESTRICT,
 receipt_json TEXT NOT NULL CHECK (length(receipt_json) BETWEEN 1 AND 8192),
 receipt_sha256 TEXT NOT NULL CHECK (length(receipt_sha256) = 66),
 evidence_json TEXT NOT NULL CHECK (length(evidence_json) BETWEEN 1 AND 16384),
 evidence_sha256 TEXT NOT NULL CHECK (length(evidence_sha256) = 66),
 recorded_at INTEGER NOT NULL CHECK (recorded_at > 0)
) STRICT;
CREATE TRIGGER transfer_finality_immutable BEFORE UPDATE ON transfer_finality_journal
BEGIN SELECT RAISE(ABORT, 'immutable transfer finality'); END;
-- Preserve the first contradiction. Bounded to one row per operation; once
-- quarantined, later agreement cannot silently clear the conflict.
CREATE TABLE transfer_finality_conflicts (
 operation_id TEXT PRIMARY KEY REFERENCES transfer_finality_journal(operation_id) ON DELETE RESTRICT,
 receipt_json TEXT NOT NULL CHECK (length(receipt_json) BETWEEN 1 AND 8192),
 receipt_sha256 TEXT NOT NULL CHECK (length(receipt_sha256) = 66),
 evidence_json TEXT NOT NULL CHECK (length(evidence_json) BETWEEN 1 AND 16384),
 evidence_sha256 TEXT NOT NULL CHECK (length(evidence_sha256) = 66),
 recorded_at INTEGER NOT NULL CHECK (recorded_at > 0)
) STRICT;
CREATE TRIGGER transfer_conflict_immutable BEFORE UPDATE ON transfer_finality_conflicts
BEGIN SELECT RAISE(ABORT, 'immutable transfer conflict'); END;
