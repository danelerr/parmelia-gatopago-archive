import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const write = process.argv[2] === '--write';
assert(process.argv.length === (write ? 3 : 2), 'Usage: payment-abis.mjs [--write]');
for (const name of ['GatoPagoPaymentRouter', 'GatoPagoCctpPaymentRouter', 'GatoPagoCrosschainRouter']) {
  const { abi } = JSON.parse(readFileSync(resolve(root, `contracts/out/${name}.sol/${name}.json`), 'utf8'));
  assert(Array.isArray(abi) && abi.length, `Missing compiled ABI: ${name}`);
  const path = resolve(root, `shared/abis/${name}.json`), expected = JSON.stringify(abi, null, 2) + '\n';
  if (write) { mkdirSync(resolve(root, 'shared/abis'), { recursive: true }); writeFileSync(path, expected); }
  else assert.equal(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'), expected, `Stale payment ABI: ${name}. Run pnpm build:contracts and node scripts/payment-abis.mjs --write.`);
}
console.log(`Payment ABIs ${write ? 'generated' : 'verified'} from compiled contracts.`);
