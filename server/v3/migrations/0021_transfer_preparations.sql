-- Local, unreleased V3. An unsigned review never locks a nonce or funds.
CREATE TABLE transfer_preparations (
 id TEXT PRIMARY KEY CHECK (length(id) = 39 AND id GLOB 'op_*'),
 wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
 wallet_account_id TEXT NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
 consent_digest TEXT NOT NULL CHECK (length(consent_digest) = 66),
 deployment_manifest_sha256 TEXT NOT NULL CHECK (length(deployment_manifest_sha256) = 66),
 review_json TEXT NOT NULL CHECK (length(review_json) BETWEEN 1 AND 150000),
 review_sha256 TEXT NOT NULL CHECK (length(review_sha256) = 66),
 authorized_auth_time INTEGER NOT NULL CHECK (authorized_auth_time >= 0),
 created_at INTEGER NOT NULL CHECK (created_at > 0),
 expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
 UNIQUE(wallet_account_id, consent_digest)
) STRICT;
CREATE INDEX transfer_preparation_expiry ON transfer_preparations(wallet_account_id, expires_at);
CREATE TRIGGER transfer_preparation_immutable BEFORE UPDATE ON transfer_preparations
BEGIN SELECT RAISE(ABORT, 'immutable transfer preparation'); END;
