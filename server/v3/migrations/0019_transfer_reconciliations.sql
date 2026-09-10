CREATE TABLE transfer_reconciliations (
 operation_id TEXT PRIMARY KEY REFERENCES transfer_finality_journal(operation_id) ON DELETE RESTRICT,
 wallet_account_id TEXT NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
 receipt_sha256 TEXT NOT NULL CHECK (length(receipt_sha256) = 66),
 block_number TEXT NOT NULL CHECK (length(block_number) BETWEEN 1 AND 78 AND block_number NOT GLOB '*[^0-9]*'
   AND (block_number = '0' OR substr(block_number,1,1) != '0')),
 block_hash TEXT NOT NULL CHECK (length(block_hash) = 66),
 proof_json TEXT NOT NULL CHECK (length(proof_json) BETWEEN 1 AND 32768),
 proof_sha256 TEXT NOT NULL CHECK (length(proof_sha256) = 66),
 recorded_at INTEGER NOT NULL CHECK (recorded_at > 0)
) STRICT;
CREATE TRIGGER transfer_reconciliation_immutable BEFORE UPDATE ON transfer_reconciliations
BEGIN SELECT RAISE(ABORT, 'immutable transfer reconciliation'); END;
CREATE TRIGGER transfer_reconciled_requires_evidence BEFORE UPDATE OF state ON transfer_nonce_reservations
WHEN NEW.state = 'reconciled' AND (OLD.state != 'delivery_pending' OR NOT EXISTS
  (SELECT 1 FROM transfer_reconciliations e WHERE e.operation_id = NEW.id AND e.wallet_account_id = NEW.wallet_account_id))
BEGIN SELECT RAISE(ABORT, 'transfer reconciliation required'); END;
CREATE TRIGGER transfer_reconciled_terminal BEFORE UPDATE OF state ON transfer_nonce_reservations
WHEN OLD.state = 'reconciled' AND NEW.state != OLD.state
BEGIN SELECT RAISE(ABORT, 'terminal transfer reconciliation'); END;
-- Runs within the evidence insertion's transaction. A floor/update failure rolls
-- back the evidence insert as well: no released hold without its watermark.
CREATE TRIGGER transfer_reconciliation_commit AFTER INSERT ON transfer_reconciliations
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM transfer_nonce_reservations r
   JOIN transfer_finality_journal j ON j.operation_id = r.id
   WHERE r.id = NEW.operation_id AND r.wallet_account_id = NEW.wallet_account_id
     AND r.state = 'delivery_pending' AND j.receipt_sha256 = NEW.receipt_sha256
     AND NOT EXISTS (SELECT 1 FROM transfer_finality_conflicts c WHERE c.operation_id = r.id))
   THEN RAISE(ABORT, 'transfer reconciliation conflict') END;
 INSERT INTO wallet_balance_floors(wallet_account_id,block_number,block_hash,recorded_at)
 VALUES (NEW.wallet_account_id,NEW.block_number,NEW.block_hash,NEW.recorded_at)
 ON CONFLICT(wallet_account_id) DO UPDATE SET block_number = excluded.block_number,
   block_hash = excluded.block_hash, recorded_at = excluded.recorded_at;
 UPDATE transfer_nonce_reservations SET state = 'reconciled' WHERE id = NEW.operation_id AND state = 'delivery_pending';
END;
