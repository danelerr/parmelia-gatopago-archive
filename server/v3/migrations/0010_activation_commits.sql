-- Second, explicit consent after observing the pending onchain proposal.
-- A signed row is neither delivery nor evidence that the active policy was installed.
CREATE TABLE account_activation_commits (
 id TEXT PRIMARY KEY CHECK (length(id) = 39 AND id GLOB 'op_*'),
 activation_id TEXT NOT NULL REFERENCES account_activations(id) ON DELETE RESTRICT,
 snapshot_json TEXT NOT NULL CHECK (length(snapshot_json) <= 12288 AND json_valid(snapshot_json)),
 commit_digest TEXT NOT NULL CHECK (length(commit_digest) = 66),
 valid_after INTEGER NOT NULL CHECK (valid_after > 0),
 valid_until INTEGER NOT NULL CHECK (valid_until > valid_after AND valid_until <= valid_after + 300),
 authorized_at INTEGER,
 assertion_body TEXT CHECK (length(assertion_body) <= 7000 AND json_valid(assertion_body)),
 confirmation_json TEXT CHECK (length(confirmation_json) <= 16384 AND json_valid(confirmation_json)),
 calldata_sha256 TEXT CHECK (length(calldata_sha256) = 66),
 CHECK ((authorized_at IS NULL AND assertion_body IS NULL AND confirmation_json IS NULL AND calldata_sha256 IS NULL)
  OR (authorized_at IS NOT NULL AND authorized_at >= valid_after AND authorized_at < valid_until
   AND assertion_body IS NOT NULL AND confirmation_json IS NOT NULL AND calldata_sha256 IS NOT NULL))
) STRICT;
CREATE INDEX account_activation_commits_parent ON account_activation_commits(activation_id, valid_after, id);
CREATE TRIGGER account_activation_commits_immutable BEFORE UPDATE ON account_activation_commits
WHEN NEW.id IS NOT OLD.id OR NEW.activation_id IS NOT OLD.activation_id OR NEW.snapshot_json IS NOT OLD.snapshot_json
 OR NEW.commit_digest IS NOT OLD.commit_digest OR NEW.valid_after IS NOT OLD.valid_after OR NEW.valid_until IS NOT OLD.valid_until
 OR OLD.authorized_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Activation confirmation is immutable'); END;
