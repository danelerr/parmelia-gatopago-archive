-- Unreleased V3. The future reconciliation transaction advances this watermark
-- atomically with reservation release. Heights remain exact decimal strings.
CREATE TABLE wallet_balance_floors (
 wallet_account_id TEXT PRIMARY KEY REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
 block_number TEXT NOT NULL CHECK (length(block_number) BETWEEN 1 AND 78
   AND block_number NOT GLOB '*[^0-9]*' AND (block_number = '0' OR substr(block_number,1,1) != '0')),
 block_hash TEXT NOT NULL CHECK (length(block_hash) = 66),
 recorded_at INTEGER NOT NULL CHECK (recorded_at > 0)
) STRICT;
CREATE TRIGGER wallet_balance_floor_monotonic BEFORE UPDATE ON wallet_balance_floors
WHEN NEW.wallet_account_id != OLD.wallet_account_id
  OR length(NEW.block_number) < length(OLD.block_number)
  OR (length(NEW.block_number) = length(OLD.block_number) AND NEW.block_number < OLD.block_number)
  OR (NEW.block_number = OLD.block_number AND NEW.block_hash != OLD.block_hash)
  OR NEW.recorded_at < OLD.recorded_at
BEGIN SELECT RAISE(ABORT, 'balance floor cannot regress'); END;
