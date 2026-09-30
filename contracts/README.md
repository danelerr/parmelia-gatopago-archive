# GatoPago Contracts — V3 on Arbitrum Sepolia

Active source is `src/v3/` plus four reusable payment/sponsorship rails in `src/`.
Historical V2 source and ABI snapshots are in [legacy](legacy/README.md), outside
the default Foundry compilation and deployment path. Historical deployments in
`deployments/` are **not V3 deployments or release pins**.

| Component | Responsibility |
|---|---|
| AccountV3 / AccountFactoryV3 / AccountV3Proxy | User-controlled account, deterministic identity and deployment |
| AccountV3WebAuthnVerifier | P256/WebAuthn with explicit RP and origin checks |
| AccountV3Security / AccountV3Upgrade | Fixed linked libraries; their addresses and hashes are release artifacts |
| GatoPagoPaymaster | Expiring per-operation gas sponsorship; no user-account authority |
| GatoPagoPaymentRouter | USDC same-chain checkout, exact merchant amount, bounded fee, one winner per intent |
| GatoPagoCctpPaymentRouter | Signed source burn for merchant settlement; not proof of destination receipt |
| GatoPagoCrosschainRouter | Outbound CCTP with caller-scoped replay protection and fee bound |

Consumer authority: one passkey initially; optional equivalent backups, SPEND
and ADMIN 1-of-N. No assisted recovery, support reset, RECOVERY role or individual
veto. Losing all keys loses access. Upgrades retain typed authorization, fresh
commit, delay, layout checks and optional irreversible freeze.

Compiler: Solidity 0.8.34, via-IR, Cancun, optimizer 200. Changing source, links,
constructor arguments or compiler settings changes deployment bytecode and
possibly CREATE2 addresses. CREATE2 is not a migration or an upgrade mechanism.

## Local verification

```text
node scripts/v3-contract-boundary.mjs
node scripts/verify-solidity-dependencies.mjs
node scripts/verify-entrypoint-source.mjs
cd contracts
forge test --summary
forge lint --severity high med low --deny warnings
forge build --force --build-info --extra-output metadata
cd ..
node scripts/v3-contract-build-manifest.mjs --self-test
node scripts/v3-storage-layout.mjs
```

The tests include actual local EntryPoint execution and software P256 signatures;
they do not prove browser ceremonies, public bundler admission or testnet funds.

## Deployment

Use [the V3 release runbook](../docs/operations/v3-contract-regularization-2026-09-21.md).
`script/DeployV3.s.sol` has separate library and linked-account phases.
`script/Deploy.s.sol` contains the renamed auxiliary rails, not a V2 account
deployment. CLI keystores sign; scripts never accept plaintext private keys.

The V3 account stack was deployed on Arbitrum Sepolia on 2026-09-26. See the
[deployment record](deployments/421614/account-v3/README.md) for the five addresses,
successful transactions, bytecode checks and exact Sourcify verification.
Wallet Core/Web admission and the browser/bundler smoke remain pending; this
deployment does not include a paymaster or payment routers. Mainnet remains excluded.
A third-party audit and real user/testnet evidence are still required.
