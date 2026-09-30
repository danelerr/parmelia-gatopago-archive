// Read-only release guard: archived V2 code must never re-enter the V3 build/runtime.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function walk(path) {
  return readdirSync(root + path, { withFileTypes: true }).flatMap((entry) => {
    const name = `${path}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${name}`);
    return entry.isDirectory() ? walk(name) : [name];
  });
}
const paths = ['contracts/src', 'contracts/script', 'shared/v3', 'gatopago-wallet-core/src', 'apps/web/src']
  .flatMap(walk).filter((path) => /\.(sol|[cm]?[jt]sx?)$/.test(path));
for (const path of paths) {
  const source = readFileSync(root + path, 'utf8');
  assert(!/\b(?:AccountWebAuthnV2|AccountFactoryV2|ParmeliaPaymaster|ParmeliaPaymentRouterV2|ParmeliaCctpPaymentRouter|ParmeliaCrosschainRouter)\b/.test(source), `Historical contract in active V3 source: ${path}`);
  assert(!/(?:from\s*|import\s*)["'][^"']*(?:legacy\/|legacy-contracts)/.test(source), `Legacy dependency: ${path}`);
}
for (const name of ['GatoPagoPaymaster', 'GatoPagoPaymentRouter', 'GatoPagoCctpPaymentRouter', 'GatoPagoCrosschainRouter']) {
  assert(readFileSync(`${root}contracts/src/${name}.sol`, 'utf8').includes(`contract ${name} `));
}
console.log(`V3 contract boundary: ${paths.length} source files checked; no V2 account or legacy deployment imports.`);
