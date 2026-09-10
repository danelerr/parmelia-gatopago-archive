-- Public credential material only. Enrolling proves a key can sign; it never
-- adds a signer to a smart account or grants spend/admin/recovery authority.
CREATE TABLE webauthn_enrollments (
  id TEXT PRIMARY KEY CHECK (length(id) = 39 AND id GLOB 'op_*'),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE RESTRICT,
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  challenge TEXT NOT NULL UNIQUE,
  proof_challenge TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 300),
  completed_at INTEGER,
  response_hash TEXT,
  CHECK ((completed_at IS NULL AND response_hash IS NULL) OR
    (completed_at >= created_at AND completed_at < expires_at AND length(response_hash) = 66))
) STRICT;
CREATE INDEX webauthn_enrollments_owner_time ON webauthn_enrollments(user_id, created_at);

CREATE TABLE webauthn_credentials (
  id TEXT PRIMARY KEY CHECK (length(id) = 39 AND id GLOB 'op_*'),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE RESTRICT,
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  credential_id TEXT NOT NULL CHECK (length(credential_id) BETWEEN 1 AND 1366),
  public_key TEXT NOT NULL CHECK (length(public_key) = 258 AND substr(public_key,1,2) = '0x' AND substr(public_key,3) NOT GLOB '*[^0-9a-f]*'),
  transports_json TEXT NOT NULL CHECK (json_valid(transports_json)),
  aaguid TEXT NOT NULL,
  backup_eligible INTEGER NOT NULL CHECK (backup_eligible IN (0,1)),
  backed_up INTEGER NOT NULL CHECK (backed_up IN (0,1) AND backed_up <= backup_eligible),
  sign_count INTEGER NOT NULL CHECK (sign_count BETWEEN 0 AND 4294967295),
  response_hash TEXT NOT NULL CHECK (length(response_hash) = 66),
  created_at INTEGER NOT NULL,
  UNIQUE(rp_id, credential_id),
  UNIQUE(rp_id, public_key)
) STRICT;
CREATE INDEX webauthn_credentials_owner ON webauthn_credentials(user_id, rp_id, id);
