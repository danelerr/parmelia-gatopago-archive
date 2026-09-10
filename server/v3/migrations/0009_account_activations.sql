-- Owned bootstrap consent, not onchain activation or current spending authority.
-- No unique reservation on wallet/account/nonce: the contract arbitrates execution.
CREATE TABLE account_activations (
  id TEXT PRIMARY KEY CHECK (length(id) = 39 AND id GLOB 'op_*'),
  user_id TEXT NOT NULL REFERENCES user_identities(id) ON DELETE RESTRICT,
  initialization_id TEXT NOT NULL REFERENCES account_initializations(id) ON DELETE RESTRICT,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  wallet_account_id TEXT NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  policy_json TEXT NOT NULL CHECK (length(policy_json) <= 12288 AND json_valid(policy_json)),
  snapshot_json TEXT NOT NULL CHECK (length(snapshot_json) <= 8192 AND json_valid(snapshot_json)),
  proposal_hash TEXT NOT NULL CHECK (length(proposal_hash) = 66),
  expected_manifest_hash TEXT NOT NULL CHECK (length(expected_manifest_hash) = 66),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 300),
  -- Independently signed completion deadline, never renewed by a read/retry.
  proposal_expires_at INTEGER NOT NULL CHECK (proposal_expires_at > expires_at AND proposal_expires_at - created_at <= 604800 AND proposal_expires_at < 281474976710656),
  authorized_at INTEGER,
  authorization_json TEXT CHECK (length(authorization_json) <= 120000 AND json_valid(authorization_json)),
  authorization_snapshot_json TEXT CHECK (length(authorization_snapshot_json) <= 8192 AND json_valid(authorization_snapshot_json)),
  calldata_sha256 TEXT CHECK (length(calldata_sha256) = 66),
  CHECK ((authorized_at IS NULL AND authorization_json IS NULL AND authorization_snapshot_json IS NULL AND calldata_sha256 IS NULL)
    OR (authorized_at IS NOT NULL AND authorized_at >= created_at AND authorized_at < expires_at
      AND authorization_json IS NOT NULL AND authorization_snapshot_json IS NOT NULL AND calldata_sha256 IS NOT NULL))
) STRICT;
CREATE INDEX account_activations_owner_time ON account_activations(user_id, created_at, id);
CREATE TRIGGER account_activations_immutable BEFORE UPDATE ON account_activations
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id
  OR NEW.initialization_id IS NOT OLD.initialization_id OR NEW.wallet_id IS NOT OLD.wallet_id
  OR NEW.wallet_account_id IS NOT OLD.wallet_account_id OR NEW.policy_json IS NOT OLD.policy_json
  OR NEW.snapshot_json IS NOT OLD.snapshot_json OR NEW.proposal_hash IS NOT OLD.proposal_hash
  OR NEW.expected_manifest_hash IS NOT OLD.expected_manifest_hash OR NEW.created_at IS NOT OLD.created_at
  OR NEW.expires_at IS NOT OLD.expires_at OR NEW.proposal_expires_at IS NOT OLD.proposal_expires_at OR OLD.authorized_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Activation consent is immutable'); END;
