// Explicit, offline package promotion. Never runs as a consumer build hook.
// Generated archives are local dependencies; this does NOT publish to a registry.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
assert(process.argv.slice(2).every(value => value === '--replace-candidate'), 'Only --replace-candidate is supported.');
const replaceCandidate = process.argv.includes('--replace-candidate');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const artifacts = ['EntryPoint', 'AccountV3Security', 'AccountV3Upgrade', 'AccountV3', 'AccountFactoryV3', 'AccountV3WebAuthnVerifier', 'AccountV3Proxy', 'GatoPagoPaymaster', 'AccountV3Interop', 'AccountV3Execution'];
const artifactRoot = join(root, 'contracts/release-package/artifacts');
mkdirSync(artifactRoot, { recursive: true });
const inventory = [];
for (const name of artifacts) {
  const input = join(root, `contracts/out/${name}.sol/${name}.json`);
  const bytes = readFileSync(input);
  const artifact = JSON.parse(bytes);
  assert(artifact.abi && artifact.bytecode && artifact.deployedBytecode, `Build contracts first: ${name}`);
  const snapshot = Buffer.from(JSON.stringify({ abi: artifact.abi,
    bytecode: { object: artifact.bytecode.object, linkReferences: artifact.bytecode.linkReferences },
    deployedBytecode: { object: artifact.deployedBytecode.object },
  }) + '\n');
  writeFileSync(join(artifactRoot, `${name}.json`), snapshot);
  inventory.push({ name, compiled_artifact_sha256: hash(bytes), snapshot_sha256: hash(snapshot) });
}
writeFileSync(join(root, 'contracts/release-package/provenance.json'), JSON.stringify({
  schema_version: 1, purpose: 'local-test-artifacts-not-deployment-attestation',
  compiler: 'solc-0.8.34', foundry_toml_sha256: hash(readFileSync(join(root, 'contracts/foundry.toml'))), artifacts: inventory,
}, null, 2) + '\n');
// Contract tests own their vectors. Promote explicitly, not through sibling paths.
mkdirSync(join(root, 'contracts/test/fixtures'), { recursive: true });
for (const name of ['payment-authorizations.json', 'v3-protocol.json', 'v3-webauthn-encoding.json', 'v3-webauthn-chromium.json']) {
  copyFileSync(join(root, 'shared/fixtures', name), join(root, 'contracts/test/fixtures', name));
}
const producers = ['shared', 'packages/environment', 'packages/test-fixtures', 'packages/brand', 'contracts/release-package'];
const destinations = {
  'apps/web': ['@gatopago/shared', '@gatopago/environment', '@gatopago/test-fixtures', '@gatopago/brand'],
  'gatopago-wallet-core': ['@gatopago/shared', '@gatopago/environment', '@gatopago/test-fixtures', '@gatopago/contract-artifacts'],
  'gatopago-flow': ['@gatopago/shared', '@gatopago/environment'],
};
// pnpm supplies its CLI path when this generator is invoked with pnpm release:vendor.
const pnpm = process.env.npm_execpath;
assert(pnpm && /pnpm\.(?:m?js|cjs)$/.test(pnpm), 'Run pnpm release:vendor; no global CLI guessing.');
const staging = join(root, 'output/package-releases');
mkdirSync(staging, { recursive: true });
const packages = [];
for (const producer of producers) {
  const metadata = JSON.parse(readFileSync(join(root, producer, 'package.json'), 'utf8'));
  assert(/^\d+\.\d+\.\d+$/.test(metadata.version), 'Use an explicit immutable package version.');
  execFileSync(process.execPath, [pnpm, '--dir', join(root, producer), 'pack', '--pack-destination', staging], { stdio: 'inherit' });
  const file = metadata.name.replace(/^@/, '').replace('/', '-') + '-' + metadata.version + '.tgz';
  const path = join(staging, file);
  // No hidden env, caches, symlinks or scripts from the sibling projects in archives.
  const contents = execFileSync('tar', ['-tf', path], { encoding: 'utf8' });
  assert(!/(?:^|\/)(?:\.env[^/]*|\.dev\.vars[^/]*|node_modules|\.git|\.wrangler)(?:\/|$)/m.test(contents));
  packages.push({ name: metadata.name, version: metadata.version, file, sha256: hash(readFileSync(path)), producer });
}
for (const [project, names] of Object.entries(destinations)) {
  const vendor = join(root, project, 'vendor'); mkdirSync(vendor, { recursive: true });
  const selected = packages.filter(p => names.includes(p.name));
  // A released version must not silently change underneath a consumer.
  // This escape is only for an explicitly reviewed, UNPUBLISHED local candidate.
  for (const item of selected) {
    const target = join(vendor, item.file);
    if (existsSync(target) && !replaceCandidate) assert.equal(hash(readFileSync(target)), item.sha256, 'Immutable package version changed. Bump its version; use --replace-candidate only before publication.');
  }
  for (const item of selected) copyFileSync(join(staging, item.file), join(vendor, item.file));
  assert.equal(readdirSync(vendor).filter(p => p.endsWith('.tgz')).length, selected.length, 'Unexpected stale archive: review manually.');
  writeFileSync(join(vendor, 'manifest.json'), JSON.stringify({ schema_version: 1, packages: selected }, null, 2) + '\n');
}
console.log('Promoted explicit versioned snapshots. Review diffs and lockfiles before releasing; no registry publication.');
