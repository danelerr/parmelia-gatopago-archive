// Offline build inventory, NOT a deployment/admission manifest. Never supplies addresses or release pins.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const contracts = fileURLToPath(new URL("../contracts/", import.meta.url));
const names = ["AccountV3", "AccountFactoryV3", "AccountV3Proxy", "AccountV3WebAuthnVerifier", "AccountV3Security", "AccountV3Upgrade",
    "GatoPagoPaymaster", "GatoPagoPaymentRouter", "GatoPagoCctpPaymentRouter", "GatoPagoCrosschainRouter"];
const sourcePath = (name) => `src/${name.startsWith('GatoPago') ? '' : 'v3/'}${name}.sol`;
const sha = (value) => `0x${createHash("sha256").update(value).digest("hex")}`;
const jsonHash = (value) => sha(JSON.stringify(value));
const read = (path) => readFileSync(new URL(path, import.meta.url));
const sourceHashes = new Map();

function localSourceHash(path) {
    // Metadata is an input, not permission to read arbitrary local files.
    assert.match(path, /^(src\/|lib\/openzeppelin-contracts\/contracts\/)[A-Za-z0-9_./-]+\.sol$/);
    assert(!path.split("/").includes(".."));
    if (!sourceHashes.has(path)) {
        const bytes = read(`../contracts/${path}`);
        const hash = execFileSync("cast", ["keccak"], {
            input: `0x${bytes.toString("hex")}`, encoding: "utf8", maxBuffer: 1024 * 1024,
        }).trim();
        assert.match(hash, /^0x[0-9a-f]{64}$/);
        sourceHashes.set(path, hash);
    }
    return sourceHashes.get(path);
}

function component(name, artifact) {
    const metadata = artifact.metadata;
    assert(metadata && typeof metadata === "object", `${name}: missing compiler metadata`);
    assert.match(metadata.compiler.version, /^0\.8\.34\+/);
    assert.deepEqual(metadata.settings.compilationTarget, { [sourcePath(name)]: name });
    assert.equal(metadata.settings.optimizer.enabled, true);
    assert.equal(metadata.settings.optimizer.runs, 200);
    assert.equal(metadata.settings.viaIR, true);
    assert.equal(metadata.settings.evmVersion, "cancun");
    for (const [path, evidence] of Object.entries(metadata.sources)) {
        assert.equal(localSourceHash(path), evidence.keccak256, `${name}: stale artifact source ${path}; rebuild`);
    }
    const linked = new Set();
    for (const field of ["bytecode", "deployedBytecode"]) {
        assert(artifact[field]?.object?.length > 2, `${name}: missing ${field}`);
        for (const [path, libraries] of Object.entries(artifact[field].linkReferences ?? {})) {
            for (const library of Object.keys(libraries)) {
                assert(["AccountV3Security", "AccountV3Upgrade"].includes(library), `Unreviewed library ${library}`);
                assert.equal(path, `src/v3/${library}.sol`);
                linked.add(library);
            }
        }
    }
    if (["AccountV3", "AccountFactoryV3"].includes(name)) {
        assert.deepEqual([...linked].sort(), ["AccountV3Security", "AccountV3Upgrade"]);
    }
    const runtimeBytes = artifact.deployedBytecode.object.replace(/^0x/, "").length / 2;
    assert(runtimeBytes <= 20_000, `${name}: runtime exceeds reviewed headroom`);
    return {
        name, compiler: metadata.compiler, settings: metadata.settings,
        abi_sha256: jsonHash(artifact.abi), metadata_sha256: jsonHash(metadata),
        // These hashes include linker placeholders and immutable zeroes; NEVER call them runtime codehashes.
        creation_template_sha256: sha(artifact.bytecode.object),
        runtime_template_sha256: sha(artifact.deployedBytecode.object), runtime_bytes: runtimeBytes,
        creation_links: artifact.bytecode.linkReferences ?? {},
        runtime_links: artifact.deployedBytecode.linkReferences ?? {},
        immutable_references: artifact.deployedBytecode.immutableReferences ?? {},
        dependencies: [...linked].sort(),
    };
}

const artifacts = new Map(names.map((name) => [name, JSON.parse(read(`../contracts/out/${name}.sol/${name}.json`))]));
const components = names.map((name) => component(name, artifacts.get(name)));
const layout = JSON.parse(read("../shared/fixtures/v3-storage-layout.json"));
const manifest = {
    schema_version: 2, purpose: "gatopago_v3_contract_build_inventory", chain_scope: [421614], admitted: false,
    optional_rails: ["GatoPagoCctpPaymentRouter", "GatoPagoCrosschainRouter"],
    source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: contracts, encoding: "utf8" }).trim(),
    source_worktree_dirty: execFileSync("git", ["status", "--porcelain"], { cwd: contracts, encoding: "utf8" }).trim().length > 0,
    foundry_config_sha256: sha(read("../contracts/foundry.toml")),
    dependency_lock_sha256: sha(read("../contracts/foundry.lock")),
    entrypoint_source_manifest_sha256: sha(read("../contracts/entrypoint-source-integrity.json")),
    layout_fixture_sha256: jsonHash(layout), declared_storage_layout_hash: layout.storageLayoutHash,
    sources: Object.fromEntries([...sourceHashes.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
    components,
    deployment_evidence: null,
    identity_rule: "Initial implementation/factory/proxy initCode define creation; current implementation is separately admitted after upgrades.",
};

if (process.argv.includes("--self-test")) {
    const target = artifacts.get("AccountV3");
    const badCompiler = structuredClone(target);
    badCompiler.metadata.settings.optimizer.runs = 1_000_000;
    assert.throws(() => component("AccountV3", badCompiler));
    const missingLinks = structuredClone(target);
    missingLinks.bytecode.linkReferences = {};
    missingLinks.deployedBytecode.linkReferences = {};
    assert.throws(() => component("AccountV3", missingLinks));
    const stale = structuredClone(target);
    stale.metadata.sources["src/v3/AccountV3.sol"].keccak256 = `0x${"00".repeat(32)}`;
    assert.throws(() => component("AccountV3", stale));
    assert.equal(jsonHash(manifest), jsonHash(structuredClone(manifest)));
    console.log(`V3 build inventory: ${components.length} artifacts, ${sourceHashes.size} sources; compiler/link/stale-source checks pass; admitted=false`);
} else {
    assert.equal(process.argv.length, 2, "Only --self-test is supported");
    console.log(JSON.stringify({ ...manifest, inventory_sha256: jsonHash(manifest) }, null, 2));
}
