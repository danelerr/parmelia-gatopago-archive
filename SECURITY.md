# Security

Report vulnerabilities privately to the repository owner with the affected component, reproduction steps and impact. Do not publish secrets, passkey material or user data.

## Current trust boundaries

- Account V3 signatures grant spending and administrative authority. Firebase identity alone does not grant either authority.
- Wallet Core owns identities, credentials, personal execution and `WALLET_DB`. Flow owns commerce, settlement, webhooks and `PAYMENTS_DB`.
- Flow's current RPC is a private service-binding surface. Its service claim is not a bearer credential for a public HTTP endpoint.
- Each operation binds exact consent, network/account, nonce, expiry and required evidence. A stored projection or a successful broadcast is not proof of finalized settlement.
- HTTP provider bodies are bounded while streaming. Uncertain broadcasts are reconciled without assuming that a timeout prevented execution.
- Settlement state, ledger, events and outbox remain atomic. Webhook encryption-key rotation is current security functionality and is independent of retired account compatibility.

## Configuration and verification

Secrets belong in environment-specific secret storage or ignored local files, never in source, generated examples, screenshots or logs. Signing roles and backend resources remain separate. Consult the current backend `.dev.vars.example`, Wrangler types and README rather than historical deployment inventories.

`pnpm check:backends` verifies the current runtime boundaries and tests. CI also runs the Web checks, pinned Solidity checks and security scanners. Passing local tests does not certify a remote deployment or public bundler admission.

The repository contains fresh-database schemas and unprovisioned local Worker profiles. It has no runtime compatibility with the retired product. See [DEPLOY.md](DEPLOY.md) for the current build/provisioning scope; removing source does not delete or migrate any remote resources.
