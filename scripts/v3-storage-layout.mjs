// Build-time E0 guard. Produces a compiler-derived layout commitment, NOT an upgrade approval.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const contracts = fileURLToPath(new URL("../contracts/", import.meta.url));
execFileSync(process.execPath, [fileURLToPath(new URL("./verify-solidity-dependencies.mjs", import.meta.url))], { stdio: "inherit" });
const source = readFileSync(new URL("../contracts/src/v3/AccountV3Storage.sol", import.meta.url), "utf8");
const foundryConfig = readFileSync(new URL("../contracts/foundry.toml", import.meta.url), "utf8");
const namespace = source.match(/@custom:storage-location erc7201:([^\s]+)/)?.[1];
const root = source.match(/STORAGE_LOCATION\s*=\s*(0x[0-9a-f]{64})/)?.[1];
const solc = foundryConfig.match(/^solc\s*=\s*"([0-9.]+)"/m)?.[1];
const proposalKinds = source.match(/enum ProposalKind\s*\{([^}]+)\}/)?.[1].split(",").map((item) => item.trim()).filter(Boolean);
assert(namespace && root && solc && proposalKinds?.length, "Missing explicit namespace, root, compiler or enum definition");

// All default artifacts are needed by the following TypeScript ABI comparisons in a clean clone.
execFileSync("forge", ["build"], { cwd: contracts, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
// Foundry may reuse ABI-only artifacts even after --extra-output changes. Compile the probe
// with fresh, isolated output AND cache; never clean shared artifacts or trust a missing layout.
const scratchRoot = resolve(tmpdir());
const scratch = mkdtempSync(join(scratchRoot, "gatopago-v3-layout-"));
let raw;
try {
	execFileSync("forge", ["build", "test/AccountV3Storage.t.sol", "src/v3/AccountV3.sol", "src/v3/AccountFactoryV3.sol", "--out", join(scratch, "out"),
		"--cache-path", join(scratch, "cache"), "--extra-output", "storageLayout"], {
		cwd: contracts, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
	});
	raw = JSON.parse(readFileSync(join(scratch, "out", "AccountV3Storage.t.sol", "AccountV3StorageLayoutProbe.json"), "utf8")).storageLayout;
	assert(raw?.storage && raw?.types, "Compiler artifact is missing explicit storageLayout output");
	for (const name of ["AccountV3", "AccountV3Security", "AccountV3Upgrade", "AccountFactoryV3", "AccountV3Proxy"]) {
		const artifact = JSON.parse(readFileSync(join(scratch, "out", `${name}.sol`, `${name}.json`), "utf8"));
		const runtime = artifact.deployedBytecode?.object;
		assert(typeof runtime === "string" && runtime.length > 2, `${name}: missing runtime bytecode`);
		const runtimeBytes = (runtime.replace(/^0x/, "").length) / 2;
		assert(runtimeBytes <= 20_000, `${name}: insufficient EIP-170 headroom`);
		const metadata = typeof artifact.metadata === "string" ? JSON.parse(artifact.metadata) : artifact.metadata;
		assert.equal(metadata.settings.optimizer.enabled, true);
		assert.equal(metadata.settings.optimizer.runs, 200);
		assert.equal(metadata.settings.viaIR, true);
		assert.equal(metadata.settings.evmVersion, "cancun");
		assert.deepEqual(artifact.storageLayout?.storage, [], `${name}: unexpected ordinary storage outside reviewed namespaces`);
		if (name === "AccountV3" || name === "AccountFactoryV3") {
			const links = Object.values(artifact.deployedBytecode.linkReferences).flatMap((library) => Object.keys(library)).sort();
			assert.deepEqual(links, ["AccountV3Security", "AccountV3Upgrade"], "Unexpected linked execution target");
		}
		console.log(`${name}: isolated compiler runtime ${runtimeBytes} B; optimizer=200; link addresses/codehashes still require deployment admission`);
	}
} finally {
	// Only this invocation's generated temp directory; no source, shared cache or user backup.
	assert.equal(dirname(resolve(scratch)), scratchRoot);
	assert(basename(scratch).startsWith("gatopago-v3-layout-"));
	rmSync(scratch, { recursive: true, force: true });
}

function normalize(layout) {
	assert.equal(layout.storage.length, 1, "Probe must describe exactly one namespace");
	function expand(id, parents = []) {
		assert(!parents.includes(id), "Recursive storage types need an explicit layout encoder revision");
		const type = layout.types[id];
		assert(type, `Missing storage type ${id}`);
		const result = { label: type.label, encoding: type.encoding, numberOfBytes: type.numberOfBytes };
		for (const field of ["base", "key", "value"]) if (type[field]) result[field] = expand(type[field], [...parents, id]);
		if (type.members) result.members = type.members.map((member) => ({
			label: member.label, slot: member.slot, offset: member.offset, type: expand(member.type, [...parents, id]),
		}));
		return result;
	}
	return { schemaVersion: 1, namespace, namespaceRoot: root, compiler: solc, proposalKinds, layout: expand(layout.storage[0].type) };
}

function digest(value) {
	// This profile defines storageLayoutHash = SHA-256 of compact UTF-8 JSON in the
	// deterministic field order above. It is not a runtimeCodeHash (which uses keccak256).
	return `0x${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

const normalized = normalize(raw);
const storageLayoutHash = digest(normalized);
assert.equal(source.match(/LAYOUT_HASH\s*=\s*(0x[0-9a-f]{64})/)?.[1], storageLayoutHash,
	"AccountV3 onchain layout declaration differs from compiler evidence");

// Positive and negative evidence: ignore AST/source IDs, never ignore slots or nested members.
const metadataOnly = structuredClone(raw);
metadataOnly.storage[0].astId = 999999;
for (const type of Object.values(metadataOnly.types)) for (const member of type.members ?? []) member.astId = 999999;
assert.equal(digest(normalize(metadataOnly)), storageLayoutHash);
const tamperedSlot = structuredClone(raw);
tamperedSlot.types[tamperedSlot.storage[0].type].members[0].slot = "99";
assert.notEqual(digest(normalize(tamperedSlot)), storageLayoutHash);
const tamperedNested = structuredClone(raw);
const signer = Object.values(tamperedNested.types).find((type) => type.label === "struct AccountV3Types.SignerDescriptor");
assert(signer?.members, "Signer storage layout missing");
signer.members[0].offset = 9;
assert.notEqual(digest(normalize(tamperedNested)), storageLayoutHash);
const tamperedPacked = structuredClone(raw);
const packedSigner = Object.values(tamperedPacked.types).find((type) => type.label === "struct AccountV3Storage.StoredSigner");
assert(packedSigner?.members, "Packed signer storage layout missing");
packedSigner.members.find((member) => member.label === "identity").offset = 0;
assert.notEqual(digest(normalize(tamperedPacked)), storageLayoutHash);
const tamperedEnum = structuredClone(normalized);
tamperedEnum.proposalKinds.reverse();
assert.notEqual(digest(tamperedEnum), storageLayoutHash);

const output = JSON.stringify({ ...normalized, hashAlgorithm: "sha256-canonical-json-v1", storageLayoutHash }, null, 2) + "\n";
const file = new URL(import.meta.resolve("@gatopago/shared/fixtures/v3-storage-layout.json"));
if (process.argv.includes("--write")) {
	writeFileSync(file, output);
	console.log(`Generated E0 namespace layout: ${storageLayoutHash}`);
} else {
	assert.equal(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), output, "V3 storage layout differs; inspect the semantic diff before rebaselining");
	console.log(`V3 storage layout and tamper checks pass: ${storageLayoutHash}`);
}
