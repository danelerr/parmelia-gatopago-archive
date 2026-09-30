// Public synthetic consensus vectors only; this script cannot sign or broadcast.
import { readFileSync, writeFileSync } from "node:fs";
import { ACCOUNT_ID_TYPEHASH, accountDomain, authorizationDigest, authorizationStructHash, authorizationTypeHash, deriveAccountId, hashCalls, hashChainScope, hashSecurityManifest, predictAccountAddress } from "@gatopago/shared/v3/authorizations";
import { hashSecurityPolicy, signerId } from "@gatopago/shared/v3/security-policy";
import { ACCOUNT_SIGNATURE_TYPEHASH, accountSignatureStructHash, accountSignatureDigest, encodeAccountSignature } from "@gatopago/shared/v3/contract-signature";

const bytes32 = (value) => `0x${value.repeat(32)}`;
const address = (value) => `0x${value.repeat(20)}`;
const passkey = { kind: 1, verifier: address("ab"), verifierCodeHash: bytes32("cd"), key: `0x${"01".repeat(64)}${"11".repeat(64)}`, roles: 3 };
const initialPolicy = { mode: "active", signers: [passkey], spendThreshold: 1, adminThreshold: 1, upgradeDelaySeconds: 259200 };
const activePolicy = { ...initialPolicy, mode: "active", adminThreshold: 1, signers: [
	{ ...passkey, roles: 3 },
	{ kind: 0, verifier: address("00"), verifierCodeHash: bytes32("00"), key: address("22"), roles: 3 },
].sort((a, b) => signerId(a).localeCompare(signerId(b))) };
const identity = {
	generation: 3,
	initialSecurityCommitment: hashSecurityPolicy(initialPolicy),
	userSaltCommitment: bytes32("22"),
	factory: address("33"),
	proxyInitCodeHash: bytes32("44"),
	expectedTypeHash: ACCOUNT_ID_TYPEHASH,
};
identity.accountId = deriveAccountId(identity.initialSecurityCommitment, identity.userSaltCommitment);
identity.accountAddress = predictAccountAddress(identity.factory, identity.accountId, identity.proxyInitCodeHash);
const chains = [43113n, 84532n, 421614n];
const calls = [{ target: address("55"), value: 0n, data: "0xa9059cbb" }, { target: address("66"), value: 12n, data: "0x" }];
const common = { accountId: identity.accountId, generation: 3, securityVersion: 1n, nonce: 7n, validAfter: 1800000000, validUntil: 1800000300 };
const change = { ...common, proposalValidUntil: 1800400000, previousManifestHash: bytes32("77"), nextPolicyHash: hashSecurityPolicy(activePolicy), chainScopeHash: hashChainScope(chains) };
const proposalHash = authorizationDigest("SecurityChange", 84532n, identity.accountAddress, change);
const messages = {
	InitializationApproval: { accountId: identity.accountId, generation: 3, initialSecurityCommitment: identity.initialSecurityCommitment, userSaltCommitment: identity.userSaltCommitment, factory: identity.factory, entryPoint: address("99"), chainScopeHash: change.chainScopeHash, nonce: 0n, validAfter: common.validAfter, validUntil: common.validUntil },
	EnrollmentProof: { ...common, signerId: signerId(activePolicy.signers[0]), nextPolicyHash: change.nextPolicyHash, contextHash: proposalHash },
	CancelProposal: { ...common, proposalHash },
	FreezeUpgrades: { ...common, previousManifestHash: change.previousManifestHash, chainScopeHash: change.chainScopeHash },
	CommitProposal: { ...common, previousManifestHash: change.previousManifestHash, proposalHash, acknowledgementsHash: bytes32("fa"), chainScopeHash: change.chainScopeHash },
	ExecutionPlan: { ...common, executionMode: 0, entryPoint: address("99"), userOpHash: bytes32("aa"), callsHash: hashCalls(calls), assetLimitsHash: bytes32("bb"), feePolicyHash: bytes32("cc"), paymaster: address("dd"), previewHash: bytes32("ee") },
	SecurityChange: change,
	UpgradeManifest: { ...common, previousManifestHash: change.previousManifestHash, implementation: address("ab"), runtimeCodeHash: bytes32("ac"), storageLayoutHash: bytes32("ad"), chainScopeHash: change.chainScopeHash, migrationCallHash: bytes32("ae") },
};
const authorizations = Object.fromEntries(Object.entries(messages).map(([kind, message]) => [kind, {
	domain: { ...accountDomain, chainId: 84532, verifyingContract: identity.accountAddress },
	message,
	expectedTypeHash: authorizationTypeHash(kind),
	expectedStructHash: authorizationStructHash(kind, message),
	expectedDigest: authorizationDigest(kind, 84532n, identity.accountAddress, message),
}]));
const securityManifest = { accountId: identity.accountId, generation: 3, securityVersion: 2n, previousManifestHash: change.previousManifestHash, policyHash: change.nextPolicyHash, chainScopeHash: change.chainScopeHash };
const signatureMessage = { accountId: identity.accountId, generation: 3, securityVersion: 1n, applicationHash: bytes32("da") };
const contractSignature = {
	message: signatureMessage,
	expectedTypeHash: ACCOUNT_SIGNATURE_TYPEHASH,
	expectedStructHash: accountSignatureStructHash(signatureMessage),
	expectedDigest: accountSignatureDigest(84532n, identity.accountAddress, signatureMessage),
	// Encoding fixture only, intentionally NOT a valid cryptographic signature.
	votes: [{ signerIndex: 0, signature: "0x1234" }],
	envelope: encodeAccountSignature(signatureMessage, [{ signerIndex: 0, signature: "0x1234" }]),
};
const vector = { schemaVersion: 5, initialPolicy, activePolicy, activePolicyHash: hashSecurityPolicy(activePolicy), identity, chains, chainScopeHash: hashChainScope(chains), calls, callsHash: hashCalls(calls), securityManifest, securityManifestHash: hashSecurityManifest(securityManifest), authorizations, contractSignature };
const output = JSON.stringify(vector, (_, v) => typeof v === "bigint" ? v.toString() : v, 2) + "\n";
const file = new URL(import.meta.resolve("@gatopago/shared/fixtures/v3-protocol.json"));
if (process.argv.includes("--print")) {
	process.stdout.write(output);
} else if (process.argv.includes("--write")) {
	writeFileSync(file, output);
	console.log("Generated public V3 protocol vectors");
} else {
	if (readFileSync(file, "utf8").replace(/\r\n/g, "\n") !== output) throw new Error("V3 protocol vectors differ: review consensus changes explicitly");
	console.log("V3 protocol vectors match TypeScript encodings");
}
