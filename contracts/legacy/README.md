# Historical contracts (not part of V3)

V2 account/factory, their WebAuthn verifier and the first invoice router are
preserved here with their tests for reference only. Foundry's default `src`,
`test` and `script` directories do not include this archive. V3 must not import
these files. Existing chain deployments are historical; no proxy migration or
address reuse is implied by this source relocation.

The active account is `src/v3/AccountV3.sol`. The active payment and sponsorship
rails are `src/GatoPago*.sol`. Router signature-domain versions describe the
router protocol, not the account generation.
