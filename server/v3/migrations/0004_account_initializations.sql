-- A recorded approval is NOT a deployed wallet or permission to spend. The initializer
-- requires a separate ERC-4337 operation and final chain evidence. No legacy imports.
CREATE TABLE account_initializations (
  id TEXT PRIMARY KEY CHECK (length(id) = 39 AND id GLOB 'op_*'),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE RESTRICT,
  credential_ref TEXT NOT NULL REFERENCES webauthn_credentials(id) ON DELETE RESTRICT,
  profile_sha256 TEXT NOT NULL CHECK (length(profile_sha256) = 66),
  user_salt_commitment TEXT NOT NULL CHECK (length(user_salt_commitment) = 66),
  public_key TEXT NOT NULL CHECK (length(public_key) = 258),
  approval_digest TEXT NOT NULL CHECK (length(approval_digest) = 66),
  expected_address TEXT NOT NULL CHECK (length(expected_address) = 42),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 300),
  authorized_at INTEGER,
  assertion_signature TEXT,
  assertion_body TEXT,
  CHECK ((authorized_at IS NULL AND assertion_signature IS NULL AND assertion_body IS NULL) OR
    (authorized_at IS NOT NULL AND authorized_at >= created_at AND authorized_at < expires_at AND assertion_signature IS NOT NULL
      AND length(assertion_signature) BETWEEN 2 AND 8194
      AND assertion_body IS NOT NULL AND length(assertion_body) <= 7000 AND json_valid(assertion_body)))
) STRICT;
CREATE INDEX account_initializations_owner_created ON account_initializations(user_id, created_at);
