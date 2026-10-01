import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertReproducibleDeploySource } from './assert-reproducible-deploy-source.mjs';

export function validateWalletDeployArguments(args) {
  const { values, positionals } = parseArgs({ args, options: {
    'dry-run': { type: 'boolean' }, 'secrets-file': { type: 'string' },
  } });
  assert.equal(positionals.length, 0);
  assert(!values['dry-run'] || !values['secrets-file'], 'Use --dry-run without credentials.');
  return { dryRun: !!values['dry-run'], secretsFile: values['secrets-file'] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--drill') {
    validateWalletDeployArguments(['--dry-run']);
    validateWalletDeployArguments([]);
    for (const denied of [['server'], ['--dry-run', '--config', 'wrangler.jsonc'], ['--keep-vars', '--strict'],
      ['--dry-run', '--secrets-file', 'private.json']]) {
      assert.throws(() => validateWalletDeployArguments(denied));
    }
    console.log('Wallet Core deploy arguments cannot override the Worker or its config.');
  } else {
    const { dryRun, secretsFile } = validateWalletDeployArguments(args);
    const directory = resolve(import.meta.dirname, '../gatopago-wallet-core');
    const config = JSON.parse(readFileSync(resolve(directory, 'wrangler.remote.jsonc'), 'utf8'));
    assert.equal(config.name, 'gatopago-wallet-core', 'Use the existing Wallet Core Worker.');
    assert(config.d1_databases[0].database_id !== '00000000-0000-0000-0000-000000000000');
    const wrangler = ['exec', 'wrangler', 'deploy', '--config', 'wrangler.remote.jsonc', '--env-file', '.dev.vars.example', '--minify'];
    if (dryRun) wrangler.push('--dry-run');
    else {
      assertReproducibleDeploySource(['gatopago-wallet-core']);
      if (secretsFile) wrangler.push('--secrets-file', resolve(secretsFile));
    }
    execFileSync(process.execPath, [resolve(directory, 'scripts/deploy.mjs'), ...args], { cwd: directory, stdio: 'inherit' });
  }
}
