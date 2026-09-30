import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
assert.equal(read('gatopago-wallet-core/package.json').scripts.deploy, 'node ../scripts/deploy-wallet-core.mjs');
assert.equal(read('gatopago-flow/package.json').scripts.deploy,
  'node ../scripts/assert-reproducible-deploy-source.mjs gatopago-flow && node ../scripts/assert-flow-deploy-config.mjs && wrangler deploy --config wrangler.remote.jsonc --env-file .dev.vars.example --minify');
assert(!Object.keys(read('gatopago-wallet-core/package.json').scripts).some(name => name.includes('legacy')));
console.log('Backend deployment entrypoints match the current runtimes.');
