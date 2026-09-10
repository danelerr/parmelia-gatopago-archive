import { describe, expect, it } from "vitest";
import { hashSecurityPolicy, MAX_SIGNERS, Role, SignerKind, signerId, validateSecurityPolicy, type SecurityPolicy, type SignerDescriptor } from "../../shared/v3/securityPolicy";

const ecdsa = (byte: string): SignerDescriptor => ({ kind: SignerKind.ECDSA, verifier: `0x${"00".repeat(20)}`, verifierCodeHash: `0x${"00".repeat(32)}`, key: `0x${byte.repeat(20)}`, roles: 7, assisted: false });
const passkey = (byte: string): SignerDescriptor => ({ kind: SignerKind.WEBAUTHN, verifier: `0x${"ab".repeat(20)}`, verifierCodeHash: `0x${"cd".repeat(32)}`, key: `0x${"01".repeat(64)}${byte.repeat(64)}`, roles: 7, assisted: false });
const sort = (signers: SignerDescriptor[]) => signers.sort((a, b) => signerId(a).localeCompare(signerId(b)));
const active = (): SecurityPolicy => ({ mode: "active", signers: sort([passkey("11"), ecdsa("22")]), spendThreshold: 1, adminThreshold: 2, recoveryThreshold: 2, recoveryDelaySeconds: 259200, upgradeDelaySeconds: 259200 });

describe("V3 executable security policy", () => {
	it("bounds validation work before processing a signer set", () => {
		const signers = sort(Array.from({ length: MAX_SIGNERS + 1 }, (_, i) => ecdsa((i + 1).toString(16).padStart(2, "0"))));
		expect(() => validateSecurityPolicy({ ...active(), signers })).toThrow("signer count");
	});
	it("separates bootstrap from thresholds that do not yet exist", () => {
		const bootstrap: SecurityPolicy = { ...active(), mode: "bootstrap", signers: [{ ...passkey("11"), roles: Role.SPEND }], adminThreshold: 0, recoveryThreshold: 0 };
		expect(() => validateSecurityPolicy(bootstrap)).not.toThrow();
		expect(() => validateSecurityPolicy({ ...bootstrap, mode: "active" })).toThrow();
		expect(() => validateSecurityPolicy({ ...bootstrap, adminThreshold: 2 })).toThrow();
	});
	it("accepts actual reachable thresholds and commits to all roles", () => {
		const policy = active();
		expect(() => validateSecurityPolicy(policy)).not.toThrow();
		const original = hashSecurityPolicy(policy);
		expect(hashSecurityPolicy({ ...policy, spendThreshold: 2 })).not.toBe(original);
		expect(hashSecurityPolicy({ ...policy, recoveryDelaySeconds: 300000 })).not.toBe(original);
	});
	it.each([{ adminThreshold: 1 }, { recoveryThreshold: 1 }, { adminThreshold: 3 }, { spendThreshold: 0 }, { upgradeDelaySeconds: 172800 }, { recoveryDelaySeconds: 172800 }])("rejects weakened or unreachable policy %j", (override) => {
		expect(() => validateSecurityPolicy({ ...active(), ...override })).toThrow();
	});
	it("does not count the same public key again through another verifier or RP", () => {
		const original = passkey("11");
		const alias = { ...original, verifier: `0x${"ef".repeat(20)}` as const, key: `0x${"02".repeat(64)}${"11".repeat(64)}` as const };
		expect(() => validateSecurityPolicy({ ...active(), signers: sort([original, alias]) })).toThrow("same key");
	});
	it("never grants spend/admin to the service and permits recovery without it", () => {
		const helper = { ...ecdsa("33"), assisted: true, roles: Role.RECOVERY };
		const policy = { ...active(), signers: sort([...active().signers, helper]) };
		expect(() => validateSecurityPolicy(policy)).not.toThrow();
		expect(() => validateSecurityPolicy({ ...policy, recoveryThreshold: 3 })).toThrow();
		expect(() => validateSecurityPolicy({ ...policy, signers: sort([...active().signers, { ...helper, roles: Role.ADMIN }]) })).toThrow("Assistance");
	});
	it("requires canonical membership ordering and pinned verifier descriptors", () => {
		const policy = active();
		expect(() => validateSecurityPolicy({ ...policy, signers: [...policy.signers].reverse() })).toThrow("sorted");
		expect(() => validateSecurityPolicy({ ...policy, signers: sort([ecdsa("22"), { ...passkey("11"), verifierCodeHash: `0x${"00".repeat(32)}` }]) })).toThrow("pinned");
	});
	it("pins ERC1271 to the wallet itself without silently introducing a different adapter", () => {
		const contract = { ...ecdsa("33"), kind: SignerKind.ERC1271, verifier: `0x${"33".repeat(20)}` as const, verifierCodeHash: `0x${"44".repeat(32)}` as const };
		const policy = { ...active(), signers: sort([ecdsa("22"), contract]) };
		expect(() => validateSecurityPolicy(policy)).not.toThrow();
		expect(() => validateSecurityPolicy({ ...policy, signers: sort([ecdsa("22"), { ...contract, verifier: `0x${"55".repeat(20)}` }]) })).toThrow("contract signer address");
	});
	it("does not double count one address as both ECDSA and ERC1271", () => {
		const direct = ecdsa("22");
		const contract = { ...direct, kind: SignerKind.ERC1271, verifier: direct.key as `0x${string}`, verifierCodeHash: `0x${"44".repeat(32)}` as const };
		expect(() => validateSecurityPolicy({ ...active(), signers: sort([direct, contract]) })).toThrow("same key");
	});
});
