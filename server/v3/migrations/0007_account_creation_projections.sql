-- Historical projection, NOT a reusable authorization or current readiness proof.
-- Wallet/identity/instance and this source record are inserted in one D1 batch.
CREATE TABLE account_creation_projections (
  initialization_id TEXT PRIMARY KEY REFERENCES account_initializations(id) ON DELETE RESTRICT,
  source_epoch INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 66),
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  account_identity_id TEXT NOT NULL REFERENCES account_identities(id) ON DELETE RESTRICT,
  wallet_account_id TEXT NOT NULL UNIQUE REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  security_json TEXT NOT NULL CHECK (length(security_json) <= 16384 AND json_valid(security_json)),
  security_sha256 TEXT NOT NULL CHECK (length(security_sha256) = 66),
  projected_at INTEGER NOT NULL CHECK (projected_at > 0),
  evidence_expires_at INTEGER NOT NULL CHECK (evidence_expires_at > projected_at),
  CHECK (json_extract(security_json, '$.security.phase') IS 'bootstrap'),
  CHECK (json_extract(security_json, '$.finality') IS 'finalized'),
  CHECK (json_extract(security_json, '$.spend_readiness') IS 'not_assessed'),
  CHECK (json_extract(security_json, '$.security_version') IS '1'),
  CHECK (json_extract(security_json, '$.security_expires_at') IS evidence_expires_at),
  CHECK (projected_at >= json_extract(security_json, '$.security_observed_at')),
  FOREIGN KEY (initialization_id, source_epoch)
    REFERENCES account_creation_observations(initialization_id, lease_epoch) ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER account_creation_projections_no_update BEFORE UPDATE ON account_creation_projections BEGIN
  SELECT RAISE(ABORT, 'Creation projections are historical records');
END;
