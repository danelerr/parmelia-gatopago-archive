import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkBoundaries } from './check-wallet-flow-boundaries.mjs';

const root = resolve(import.meta.dirname, '..');
for (const path of ['server', 'payments-worker', 'gatopago-wallet-core/src/v3', 'gatopago-wallet-core/v3/wrangler.jsonc', 'gatopago-wallet-core/src/routes', 'gatopago-wallet-core/src/services',
  'contracts/legacy', 'shared/index.ts', 'shared/userOperations.ts', 'shared/EntryPointAbi.ts',
  'gatopago-flow/src/services/dataCutover.ts', 'gatopago-flow/src/services/bootstrap.ts']) {
  assert(!existsSync(resolve(root, path)), `Retired implementation reintroduced: ${path}`);
}
const inventory = checkBoundaries();
for (const path of [...inventory.wallet, ...inventory.flow].filter(path => /\.[cm]?[jt]s$/.test(path))) {
  const source = readFileSync(resolve(root, path), 'utf8');
  assert(!/\b(?:AccountWebAuthnV2|AccountFactoryV2|PAYMENTS_BOOTSTRAP_MODE|PAYMENTS_DATA_CUTOVER_CHECKSUM|GATOPAGO_DB)\b/.test(source),
    `Retired product dependency: ${path}`);
  if (path.startsWith('gatopago-flow/src/') && !/^gatopago-flow\/src\/(?:repositories|stores)\//.test(path)) {
    assert(!/PAYMENTS_DB\.(?:prepare|batch|exec)/.test(source), `SQL escaped persistence: ${path}`);
  }
  if (path.startsWith('gatopago-flow/src/services/')) {
    assert(!/CIRCLE_API_(?:BASE_URL|KEY)/.test(source), `Circle provider escaped its rail: ${path}`);
  }
}
for (const directory of ['gatopago-wallet-core/migrations', 'gatopago-flow/migrations']) {
  for (const name of readdirSync(resolve(root, directory)).filter(name => name.endsWith('.sql'))) {
    const source = readFileSync(resolve(root, directory, name), 'utf8');
    assert(!/payment_migration_control|legacy_payment_claim/.test(source), `Legacy schema: ${directory}/${name}`);
  }
}
const pkg = JSON.parse(readFileSync(resolve(root, 'gatopago-wallet-core/package.json'), 'utf8'));
assert(!Object.keys(pkg.scripts).some(name => /legacy|:v3|v3:/.test(name)), 'Wallet Core has multiple toolchains');
console.log('V3-only backend guard passed: one Wallet Core, independent Flow, no retired runtime or import schema.');
