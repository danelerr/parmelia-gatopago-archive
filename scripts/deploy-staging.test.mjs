import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stagingArguments, validateStagingConfig, validateStagingSecrets } from './deploy-staging.mjs';
const read = name => JSON.parse(readFileSync(new URL(`../gatopago-${name}/wrangler.staging.jsonc`, import.meta.url), 'utf8'));
const wallet = read('wallet-core'), flow = read('flow');
test('staging has separate databases, queues and a private identity binding', () => {
  validateStagingConfig('wallet-core', wallet, wallet); validateStagingConfig('flow', flow, wallet);
});
test('rejects implicit publication, arbitrary config and command overrides', () => {
  assert.equal(stagingArguments(['wallet-core', '--dry-run']).dryRun, true);
  assert.equal(stagingArguments(['flow', '--secrets-file', '/private/staging.json']).dryRun, false);
  for (const args of [[], ['flow'], ['server', '--dry-run'], ['wallet-core', '--config', '/tmp/other.json'],
    ['flow', '--dry-run', '--secrets-file', 'secret.json'], ['flow', '--dry-run', '--env', 'production']]) {
    assert.throws(() => stagingArguments(args));
  }
});
test('rejects local placeholders, shared storage, cross-environment binding and routes', () => {
  const withoutTlsOrigin = structuredClone(wallet);
  withoutTlsOrigin.routes = [{ pattern: 'api.staging.gatopago.com/app/v1/*', zone_name: 'gatopago.com' }];
  assert.throws(() => validateStagingConfig('wallet-core', withoutTlsOrigin, withoutTlsOrigin));
  for (const modify of [c => { c.d1_databases[0].database_id = '00000000-0000-0000-0000-000000000002'; },
    c => { c.d1_databases[0].database_id = wallet.d1_databases[0].database_id; },
    c => { c.services[0].service = 'server'; }, c => { c.routes[0].pattern = 'api.gatopago.com/*'; },
    c => { c.queues.consumers[0].dead_letter_queue = 'gatopago-payment-jobs-dlq'; },
    c => { c.vars.PAYMENT_LIVE_ENABLED = 'true'; }]) {
    const config = structuredClone(flow); modify(config);
    assert.throws(() => validateStagingConfig('flow', config, wallet));
  }
});
test('requires secrets without including values in errors', () => {
  assert.throws(() => validateStagingSecrets('wallet-core', {}), /FIREBASE_CUSTOM_TOKEN_SIGNER_JSON/);
  assert.throws(() => validateStagingSecrets('flow', []));
});
