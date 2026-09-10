-- Unreleased V3 candidate. Delivery-pending holds survive signed expiry until
-- reconciliation proves the outcome. No automatic release of uncertain sends.
CREATE TABLE transfer_nonce_reservations (
 id TEXT PRIMARY KEY CHECK (length(id) = 39 AND id GLOB 'op_*'),
 wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
 wallet_account_id TEXT NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
 network_id TEXT NOT NULL,
 account_address TEXT NOT NULL CHECK (length(account_address) = 42),
 entry_point TEXT NOT NULL CHECK (length(entry_point) = 42),
 nonce TEXT NOT NULL CHECK (length(nonce) BETWEEN 1 AND 20 AND nonce NOT GLOB '*[^0-9]*' AND (nonce = '0' OR substr(nonce,1,1) != '0')),
 consent_digest TEXT NOT NULL CHECK (length(consent_digest) = 66),
 userop_hash TEXT NOT NULL CHECK (length(userop_hash) = 66),
 deployment_manifest_sha256 TEXT NOT NULL CHECK (length(deployment_manifest_sha256) = 66),
 operation_json TEXT NOT NULL CHECK (length(operation_json) BETWEEN 1 AND 180000),
 operation_sha256 TEXT NOT NULL CHECK (length(operation_sha256) = 66),
 review_json TEXT NOT NULL CHECK (length(review_json) BETWEEN 1 AND 150000),
 review_sha256 TEXT NOT NULL CHECK (length(review_sha256) = 66),
 funds_json TEXT NOT NULL CHECK (length(funds_json) BETWEEN 1 AND 2048),
 funds_sha256 TEXT NOT NULL CHECK (length(funds_sha256) = 66),
 authorized_auth_time INTEGER NOT NULL CHECK (authorized_auth_time >= 0),
 state TEXT NOT NULL CHECK (state IN ('held','expired','delivery_pending','reconciled')),
 delivery_token_sha256 TEXT CHECK (delivery_token_sha256 IS NULL OR length(delivery_token_sha256) = 66),
 delivery_started_at INTEGER,
 delivery_expires_at INTEGER,
 delivery_dispatched_at INTEGER,
 created_at INTEGER NOT NULL CHECK (created_at > 0),
 expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
 UNIQUE(wallet_account_id,consent_digest),
 CHECK ((state IN ('delivery_pending','reconciled') AND delivery_token_sha256 IS NOT NULL AND delivery_started_at IS NOT NULL AND delivery_started_at > 0
     AND delivery_expires_at IS NOT NULL AND delivery_expires_at > delivery_started_at AND delivery_expires_at <= expires_at
     AND (delivery_dispatched_at IS NULL OR (delivery_dispatched_at >= delivery_started_at AND delivery_dispatched_at < delivery_expires_at)))
   OR (state NOT IN ('delivery_pending','reconciled') AND delivery_token_sha256 IS NULL AND delivery_started_at IS NULL AND delivery_expires_at IS NULL AND delivery_dispatched_at IS NULL))
) STRICT;
CREATE UNIQUE INDEX transfer_nonce_exclusive ON transfer_nonce_reservations(network_id,account_address,entry_point,nonce) WHERE state IN ('held','delivery_pending');
CREATE INDEX transfer_nonce_expiry ON transfer_nonce_reservations(state,expires_at);
-- A hold cannot be repriced after insertion. Expiry is a separate state change.
CREATE TRIGGER transfer_hold_terms_immutable BEFORE UPDATE OF funds_json,funds_sha256 ON transfer_nonce_reservations
WHEN NEW.funds_json != OLD.funds_json OR NEW.funds_sha256 != OLD.funds_sha256
BEGIN SELECT RAISE(ABORT, 'immutable transfer hold'); END;
