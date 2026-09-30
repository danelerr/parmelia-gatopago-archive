// Explicit binary asset reuse. Does not copy code, configuration or legacy SW.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = [
  ['192', '91b3cbaae29ae0d65133ae2ef843485040cbc0e2cec8dc4cf753025bc040caab'],
  ['512', '0d337e9a85f23ab073886ea76ef6eb85f60cf40e2dff3b022462bc7dc70f8a5a'],
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const [size, expected] of assets) {
  const target = resolve(root, `apps/web/public/pwa/meli-${size}-${expected.slice(0, 12)}.png`);
  assert.equal(hash(readFileSync(target)), expected, 'Imported icon changed');
}
console.log('Two reviewed Meli PWA icons verified; no dependency on the legacy app runtime.');
