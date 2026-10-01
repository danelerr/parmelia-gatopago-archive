import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const projects = ['apps/web', 'gatopago-wallet-core', 'gatopago-flow', 'contracts'];
for (const project of projects) test(`${project} owns install, build, tests and CI inputs`, () => {
  const directory = resolve(root, project);
  const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  assert.equal(pkg.packageManager, 'pnpm@11.23.0');
  assert(readFileSync(resolve(directory, 'pnpm-lock.yaml'), 'utf8').includes('\n  .:'));
  assert(!readFileSync(resolve(directory, 'pnpm-lock.yaml'), 'utf8').includes('link:../'));
  assert(readFileSync(resolve(directory, '.github/workflows/ci.yml'), 'utf8').includes('pnpm install --frozen-lockfile'));
  for (const spec of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) assert(!/^(?:workspace:|link:|file:\.\.)/.test(spec), `Sibling dependency: ${spec}`);
  for (const command of Object.values(pkg.scripts)) assert(!/\.\.\/|build:contracts|v3-web-release/.test(command), `Sibling script: ${command}`);
});
test('Web test harnesses do not load backend implementation or monorepo paths', () => {
  for (const name of readdirSync(resolve(root, 'apps/web/test')).filter(name => /\.(?:ts|mjs)$/.test(name))) {
    const source = readFileSync(resolve(root, 'apps/web/test', name), 'utf8');
    assert(!source.includes('gatopago-wallet-core/testing'), name);
    assert(!source.includes("'../../..'"), name);
  }
});
test('Wallet tests consume contract artifacts, not a sibling build', () => {
  for (const name of readdirSync(resolve(root, 'gatopago-wallet-core/test')).filter(name => name.endsWith('.ts'))) assert(!readFileSync(resolve(root, 'gatopago-wallet-core/test', name), 'utf8').includes('../../contracts/out/'), name);
});
test('Contracts own source remapping and vectors', () => {
  const config = readFileSync(resolve(root, 'contracts/foundry.toml'), 'utf8');
  assert(!config.includes('../node_modules') && !config.includes('../shared'));
  assert(config.includes('test/fixtures'));
});
test('The protocol revision is not a frontend build fingerprint', () => {
  const source = readFileSync(resolve(root, 'shared/v3/clientRelease.ts'), 'utf8');
  assert(source.includes("CLIENT_RELEASE_ID = 'wallet-client-v3.1'"));
  assert(!source.includes('web-release.json') && !source.includes('web-v3-'));
});
