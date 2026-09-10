-- Local V3 only. Reserve the EXACT unsigned sponsor envelope before asking a sign-only
-- adapter. No automatic nonce recycling, fee bump, replacement or backfill of old grants.
CREATE TABLE account_activation_transactions (
 operation_id TEXT PRIMARY KEY REFERENCES account_activation_outbox(operation_id) ON DELETE RESTRICT,
 network_id TEXT NOT NULL CHECK (network_id GLOB 'eip155:[1-9]*'),
 operator_address TEXT NOT NULL CHECK (length(operator_address) = 42 AND substr(operator_address,1,2) = '0x' AND substr(operator_address,3) NOT GLOB '*[^0-9a-f]*'),
 nonce INTEGER NOT NULL CHECK (nonce BETWEEN 0 AND 9007199254740991),
 unsigned_transaction TEXT NOT NULL CHECK (length(unsigned_transaction) BETWEEN 4 AND 100002 AND length(unsigned_transaction) % 2 = 0 AND substr(unsigned_transaction,1,4) = '0x02' AND substr(unsigned_transaction,3) NOT GLOB '*[^0-9a-f]*'),
 unsigned_hash TEXT NOT NULL CHECK (length(unsigned_hash) = 66 AND substr(unsigned_hash,1,2) = '0x' AND substr(unsigned_hash,3) NOT GLOB '*[^0-9a-f]*'),
 created_at INTEGER NOT NULL CHECK (created_at > 0),
 serialized_transaction TEXT,
 transaction_hash TEXT,
 UNIQUE(network_id,operator_address,nonce),
 CHECK ((serialized_transaction IS NULL AND transaction_hash IS NULL) OR
  (serialized_transaction IS NOT NULL AND transaction_hash IS NOT NULL
   AND length(serialized_transaction) BETWEEN 4 AND 100002 AND length(serialized_transaction) % 2 = 0
   AND substr(serialized_transaction,1,4) = '0x02' AND substr(serialized_transaction,3) NOT GLOB '*[^0-9a-f]*'
   AND length(transaction_hash) = 66 AND substr(transaction_hash,1,2) = '0x' AND substr(transaction_hash,3) NOT GLOB '*[^0-9a-f]*'))
) STRICT;

CREATE TRIGGER account_activation_transaction_immutable BEFORE UPDATE ON account_activation_transactions
WHEN NEW.operation_id IS NOT OLD.operation_id OR NEW.network_id IS NOT OLD.network_id
 OR NEW.operator_address IS NOT OLD.operator_address OR NEW.nonce IS NOT OLD.nonce
 OR NEW.unsigned_transaction IS NOT OLD.unsigned_transaction OR NEW.unsigned_hash IS NOT OLD.unsigned_hash
 OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.serialized_transaction IS NOT NULL AND NEW.serialized_transaction IS NOT OLD.serialized_transaction)
 OR (OLD.transaction_hash IS NOT NULL AND NEW.transaction_hash IS NOT OLD.transaction_hash)
BEGIN SELECT RAISE(ABORT, 'Activation sponsor transaction is immutable'); END;

-- Raw bytes and the send marker are committed in one D1 batch BEFORE network I/O.
CREATE TRIGGER account_activation_send_requires_transaction BEFORE UPDATE ON account_activation_outbox
WHEN NEW.state IN ('sending','uncertain','accepted') AND (NEW.transaction_hash IS NULL OR NOT EXISTS (
 SELECT 1 FROM account_activation_transactions t WHERE t.operation_id = NEW.operation_id
 AND t.serialized_transaction IS NOT NULL AND t.transaction_hash = NEW.transaction_hash))
BEGIN SELECT RAISE(ABORT, 'Activation send requires its persisted transaction'); END;
