import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertReproducibleDeploySource } from './assert-reproducible-deploy-source.mjs';

const root = resolve(import.meta.dirname, '..');
const ts = createRequire(resolve(root, 'gatopago-wallet-core/package.json'))('typescript');
const requiredSecrets = {
  'wallet-core': ['FIREBASE_CUSTOM_TOKEN_SIGNER_JSON', 'TURNSTILE_SECRET_KEY', 'AUTH_RATE_LIMIT_PEPPER',
    'WALLET_RPC_ENDPOINTS', 'PRIVATE_KEY'],
  flow: ['PAYMENT_AUTHORIZATION_SIGNER_PRIVATE_KEY', 'PAYMENT_RELAYER_PRIVATE_KEY', 'PAYMENT_RPC_URLS',
    'WEBHOOK_SECRET_ENCRYPTION_KEY', 'WEBHOOK_SECRET_ENCRYPTION_KEY_ID', 'OPS_HEALTH_TOKEN'],
};
export function stagingArguments(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'dry-run': { type: 'boolean' }, 'secrets-file': { type: 'string' },
  } });
  assert(positionals.length === 1 && Object.hasOwn(requiredSecrets, positionals[0]), 'Select wallet-core or flow.');
  assert(values['dry-run'] ? !values['secrets-file'] : !!values['secrets-file'],
    'Use --dry-run, or --secrets-file <private staging JSON file> for publication.');
  return { backend: positionals[0], dryRun: !!values['dry-run'], secretsFile: values['secrets-file'] };
}
export function validateStagingConfig(backend, config, wallet) {
  assert(Object.hasOwn(requiredSecrets, backend), 'Unknown backend');
  const name = `gatopago-${backend}-staging`, binding = backend === 'wallet-core' ? 'WALLET_DB' : 'PAYMENTS_DB';
  assert.equal(config.name, name);
  assert.equal(config.account_id, 'c26e82cd341803c9136e19e668da67c6');
  assert.equal(config.main, 'src/index.ts');
  assert.equal(config.vars?.GATOPAGO_ENVIRONMENT, 'staging');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.d1_databases?.length, 1);
  const db = config.d1_databases[0];
  assert.equal(db.binding, binding); assert.equal(db.database_name, name);
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(db.database_id), 'Provision the staging database');
  assert.equal(db.migrations_dir, 'migrations');
  const queue = `${name}-jobs`;
  assert.equal(config.queues?.producers?.length, 1); assert.equal(config.queues?.consumers?.length, 1);
  assert.equal(config.queues.producers[0].queue, queue); assert.equal(config.queues.consumers[0].queue, queue);
  assert.equal(config.queues.consumers[0].dead_letter_queue, `${queue}-dlq`);
  assert.equal(config.vars[backend === 'wallet-core' ? 'CREATION_QUEUE_NAME' : 'PAYMENT_JOBS_QUEUE_NAME'], queue);
  // Wallet Core provides the hostname and TLS; Flow's path routes take priority.
  const routes = backend === 'wallet-core'
    ? [{ pattern: 'api.staging.gatopago.com', custom_domain: true }]
    : ['v1/*', 'checkout/v1/*'].map(path => ({ pattern: `api.staging.gatopago.com/${path}`, zone_name: 'gatopago.com' }));
  assert.deepEqual(config.routes, routes);
  if (backend === 'flow') {
    assert.equal(config.account_id, wallet.account_id);
    assert.notEqual(db.database_id, wallet.d1_databases[0].database_id);
    assert.equal(config.vars.PAYMENT_LIVE_ENABLED, 'false');
    assert.deepEqual(config.services, [{ binding: 'WALLET_IDENTITY', service: wallet.name, entrypoint: 'WalletIdentity' }]);
  }
}
function readConfig(backend) {
  const path = resolve(root, `gatopago-${backend}/wrangler.staging.jsonc`);
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  assert(!parsed.error, `Invalid staging JSONC: ${backend}`);
  return parsed.config;
}
export function validateStagingSecrets(backend, secrets) {
  assert(secrets && typeof secrets === 'object' && !Array.isArray(secrets), 'Secrets must be a JSON object');
  for (const name of requiredSecrets[backend]) assert(typeof secrets[name] === 'string' && secrets[name].trim(), `Missing staging secret: ${name}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { backend, dryRun, secretsFile } = stagingArguments(process.argv.slice(2));
  const config = readConfig(backend), wallet = readConfig('wallet-core');
  validateStagingConfig('wallet-core', wallet, wallet);
  validateStagingConfig(backend, config, wallet);
  const directory = resolve(root, `gatopago-${backend}`);
  const args = ['exec', 'wrangler', 'deploy', '--config', 'wrangler.staging.jsonc', '--env-file', '.dev.vars.example', '--minify'];
  if (dryRun) args.push('--dry-run');
  else {
    const manifests = JSON.parse(readFileSync(resolve(root, 'packages/environment/environments.json'), 'utf8'));
    assert.equal(manifests.staging.status, 'provisioned', 'Finish staging admission before publishing');
    assert.equal(manifests.staging.firebase_project_id, wallet.vars.FIREBASE_PROJECT_ID);
    assert.notEqual(manifests.staging.firebase_project_id, manifests.production.firebase_project_id);
    const path = resolve(secretsFile);
    validateStagingSecrets(backend, JSON.parse(readFileSync(path, 'utf8')));
    assertReproducibleDeploySource(['gatopago-wallet-core', `gatopago-${backend}`]);
    args.push('--secrets-file', path);
  }
  execFileSync('node', [resolve(root, 'scripts/v3-web-release.mjs')], { cwd: root, stdio: 'inherit' });
  execFileSync('pnpm', args, { cwd: directory, stdio: 'inherit' });
}
