import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { assertDeploymentProfileText } from './deployment-profile-text.mjs';

const root = resolve(import.meta.dirname, '..');
const { getContractAddress, keccak256, concatHex, encodeAbiParameters } = createRequire(resolve(root, 'shared/package.json'))('viem');
const release = resolve(root, 'contracts/deployments/421614/account-v3');
const record = JSON.parse(readFileSync(resolve(release, 'deployment.json'), 'utf8'));
const sha = bytes => `0x${createHash('sha256').update(bytes).digest('hex')}`;
const json = value => JSON.stringify(value);
const readArtifact = name => execFileSync('tar', ['-xOzf', resolve(release, 'build-artifacts.tar.gz'), `${name}-artifact.json`], { maxBuffer: 4 * 1024 * 1024 });
assert.equal(record.chain_id, 421614);
assert.equal(record.checks.all_receipts_successful, true);
assert.equal(record.checks.all_runtime_bytes_and_immutables_match, true);
assert.equal(sha(readFileSync(resolve(release, record.source.build_artifacts_file))), record.source.build_artifacts_sha256);
assert.equal(sha(readFileSync(resolve(release, record.source.archive_file))), record.source.archive_sha256);
const lock = execFileSync('tar', ['-xOzf', resolve(release, record.source.archive_file), 'contracts/foundry.lock']);
const transactions = ['libraries', 'core'].flatMap(phase => JSON.parse(readFileSync(resolve(release, `${phase}-broadcast-transactions.json`), 'utf8')).transactions);

function component(name) {
  const deployed = record.components[name], bytes = readArtifact(name), artifact = JSON.parse(bytes);
  assert.equal(sha(bytes), deployed.artifactSha256);
  assert.equal(deployed.sourceVerification.evidence.creationMatch, 'exact_match');
  assert.equal(deployed.sourceVerification.evidence.runtimeMatch, 'exact_match');
  const transaction = transactions.find(tx => tx.hash === deployed.transactionHash)?.transaction;
  assert(transaction);
  assert.equal(transaction.to.toLowerCase(), record.create2_deployer.toLowerCase());
  const input = transaction.input ?? transaction.data;
  const salt = input.slice(0, 66), creation = `0x${input.slice(66)}`;
  assert(creation.startsWith(artifact.bytecode.object));
  assert.equal(keccak256(creation), deployed.initCodeHash);
  assert.equal(getContractAddress({ opcode: 'CREATE2', from: transaction.to, salt, bytecodeHash: deployed.initCodeHash }).toLowerCase(), deployed.address.toLowerCase());
  const sources = Object.fromEntries(Object.entries(artifact.metadata.sources).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, source]) => [path, source.keccak256]));
  return {
    address: deployed.address.toLowerCase(), deployer: transaction.to.toLowerCase(), salt,
    creation_code_hash: deployed.initCodeHash, runtime_code_hash: deployed.runtimeCodeHash,
    abi_sha256: sha(json(artifact.abi)), source_commit: record.source.base_commit,
    source_tree_sha256: sha(json(sources)), dependency_lock_sha256: sha(lock),
    // Exact archived Foundry compiler-output JSON, including metadata, links and immutables.
    build_info_sha256: sha(bytes),
    compiler: { version: '0.8.34', optimizer_runs: 200, via_ir: true, evm_version: 'cancun' },
    deployment_tx: deployed.transactionHash, deployed_block: String(deployed.blockNumber),
    verification_url: deployed.sourceVerification.url,
  };
}
const proxyBytes = readArtifact('AccountV3Proxy'), proxy = JSON.parse(proxyBytes);
assert.equal(keccak256(proxy.deployedBytecode.object), record.identity.proxyRuntimeCodeHash);
assert.equal(keccak256(concatHex([proxy.bytecode.object, encodeAbiParameters([{ type: 'address' }], [record.identity.initialImplementation])])), record.identity.proxyInitCodeHash);
const profile = {
  schema_version: 1, purpose: 'account_creation',
  deployment: {
    schema_version: 1, generation: 3, manifest_id: '33da0dc1-1656-41a9-9448-0ca9d53ad798',
    network_id: 'eip155:421614', genesis_hash: record.genesis_hash, lifecycle_status: 'deployed',
    entry_point: record.entrypoint.address, storage_layout_hash: record.identity.storageLayoutHash,
    proxy: { runtime_code_hash: record.identity.proxyRuntimeCodeHash, init_code_hash: record.identity.proxyInitCodeHash, artifact_sha256: sha(proxyBytes) },
    components: { factory: component('AccountFactoryV3'), implementation: component('AccountV3'),
      security_module: component('AccountV3Security'), upgrade_module: component('AccountV3Upgrade') },
  },
  proxy_creation_code: proxy.bytecode.object, webauthn_verifier: component('AccountV3WebAuthnVerifier'),
  entry_point_code_hash: record.entrypoint.runtimeCodeHash,
  sender_creator: { address: record.entrypoint.senderCreator, runtime_code_hash: record.entrypoint.senderCreatorCodeHash },
};
const output = resolve(root, 'shared/v3/arbitrum-sepolia-creation.json'), expected = `${JSON.stringify(profile, null, 2)}\n`;
if (process.argv.length === 3 && process.argv[2] === '--write') writeFileSync(output, expected);
else { assert.equal(process.argv.length, 2, 'Only --write is supported'); assertDeploymentProfileText(readFileSync(output, 'utf8'), expected); }
console.log('Arbitrum Sepolia creation profile matches the five deployed artifacts and CREATE2 recipes.');
