-- Consumer V3 only. Identity, ownership, cryptographic identity and chain instance are
-- different resources. No import from V1/V2, custodial balances, signers or API keys.
CREATE TABLE user_identities (
  id TEXT PRIMARY KEY CHECK (length(id) = 40 AND id GLOB 'usr_*'),
  firebase_project_id TEXT NOT NULL,
  firebase_subject TEXT NOT NULL CHECK (length(firebase_subject) BETWEEN 1 AND 128),
  auth_not_before INTEGER NOT NULL DEFAULT 0 CHECK (auth_not_before >= 0),
  disabled_at INTEGER,
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  UNIQUE(firebase_project_id, firebase_subject)
) STRICT;

CREATE TABLE parties (
  id TEXT PRIMARY KEY CHECK (length(id) = 40 AND id GLOB 'pty_*'),
  kind TEXT NOT NULL CHECK (kind = 'individual'),
  user_id TEXT NOT NULL UNIQUE REFERENCES user_identities(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL CHECK (created_at > 0)
) STRICT;

CREATE TABLE wallets (
  id TEXT PRIMARY KEY CHECK (length(id) = 40 AND id GLOB 'wal_*'),
  owner_party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  controller TEXT NOT NULL CHECK (controller = 'end_user'),
  account_kind TEXT NOT NULL CHECK (account_kind = 'evm_smart_account'),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at INTEGER NOT NULL CHECK (created_at > 0)
) STRICT;
CREATE INDEX wallets_owner ON wallets(owner_party_id, id);

CREATE TABLE account_identities (
  id TEXT PRIMARY KEY CHECK (length(id) = 40 AND id GLOB 'aci_*'),
  wallet_id TEXT NOT NULL UNIQUE REFERENCES wallets(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL UNIQUE CHECK (length(account_id) = 66 AND substr(account_id,1,2) = '0x' AND substr(account_id,3) NOT GLOB '*[^0-9a-f]*'),
  generation INTEGER NOT NULL CHECK (generation = 3),
  initial_security_commitment TEXT NOT NULL CHECK (length(initial_security_commitment) = 66 AND substr(initial_security_commitment,1,2) = '0x' AND substr(initial_security_commitment,3) NOT GLOB '*[^0-9a-f]*'),
  user_salt_commitment TEXT NOT NULL CHECK (length(user_salt_commitment) = 66 AND substr(user_salt_commitment,1,2) = '0x' AND substr(user_salt_commitment,3) NOT GLOB '*[^0-9a-f]*'),
  canonical_address TEXT NOT NULL CHECK (length(canonical_address) = 42 AND substr(canonical_address,1,2) = '0x' AND substr(canonical_address,3) NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  UNIQUE(id, wallet_id),
  UNIQUE(id, canonical_address)
) STRICT;

CREATE TABLE account_instances (
  account_identity_id TEXT NOT NULL,
  network_id TEXT NOT NULL CHECK (network_id GLOB 'eip155:[1-9]*' AND substr(network_id,8) NOT GLOB '*[^0-9]*'),
  address TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation = 3),
  deployment_manifest_sha256 TEXT NOT NULL CHECK (length(deployment_manifest_sha256) = 66 AND substr(deployment_manifest_sha256,1,2) = '0x' AND substr(deployment_manifest_sha256,3) NOT GLOB '*[^0-9a-f]*'),
  deployment_state TEXT NOT NULL CHECK (deployment_state IN ('counterfactual', 'deploying', 'active', 'needs_security_sync', 'unsupported', 'retired')),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  PRIMARY KEY(account_identity_id, network_id),
  UNIQUE(network_id, address),
  FOREIGN KEY(account_identity_id, address) REFERENCES account_identities(id, canonical_address) ON DELETE RESTRICT
) STRICT;

CREATE TABLE wallet_accounts (
  id TEXT PRIMARY KEY CHECK (length(id) = 40 AND id GLOB 'wac_*'),
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  account_identity_id TEXT NOT NULL,
  network_id TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  UNIQUE(wallet_id, network_id),
  FOREIGN KEY(account_identity_id, wallet_id) REFERENCES account_identities(id, wallet_id) ON DELETE RESTRICT,
  FOREIGN KEY(account_identity_id, network_id) REFERENCES account_instances(account_identity_id, network_id) ON DELETE RESTRICT
) STRICT;
