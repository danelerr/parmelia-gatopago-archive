-- Fresh Wallet Core V3 database. No user, signer, OTP or recovery state.
CREATE TABLE auth_send_limits (
  scope TEXT NOT NULL CHECK (scope IN ('ip', 'email', 'global')),
  key_hash TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0),
  reset_at INTEGER NOT NULL,
  next_allowed_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash)
);
CREATE INDEX auth_send_limits_expiry ON auth_send_limits(reset_at);
