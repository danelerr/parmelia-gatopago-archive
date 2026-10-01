// Copy only one project into an isolated scratch directory, then test its OWN
// frozen lock/build/verification entrypoints. Never copies secrets or symlinks.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const { values } = parseArgs({ options: { project: { type: 'string' }, 'prepare-only': { type: 'boolean' } } });
const projects = ['apps/web', 'gatopago-wallet-core', 'gatopago-flow', 'contracts'];
assert(projects.includes(values.project), 'Use --project apps/web|gatopago-wallet-core|gatopago-flow|contracts');
const destination = mkdtempSync(join(tmpdir(), 'gatopago-standalone-'));
const excluded = new Set(['node_modules', '.git', '.next', '.vercel', '.wrangler', 'output', 'coverage', 'test-results']);
function copy(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    if (values.project === 'contracts' && source === join(root, 'contracts') && ['out', 'cache', 'lib', 'broadcast'].includes(entry.name)) continue;
    if ((entry.name.startsWith('.env') || entry.name.startsWith('.dev.vars')) && !['.env.example', '.dev.vars.example'].includes(entry.name)) continue;
    if (/service.account|firebase.adminsdk|secrets|\.log$|\.tsbuildinfo$/i.test(entry.name)) continue;
    assert(!entry.isSymbolicLink(), `Do not copy symlinks: ${entry.name}`);
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) copy(from, to); else if (entry.isFile()) copyFileSync(from, to);
  }
}
copy(join(root, values.project), destination);
console.log(`ISOLATED_PROJECT=${values.project}\nISOLATED_DIRECTORY=${destination}`);
if (values['prepare-only']) process.exit(0);
const pnpm = process.env.npm_execpath;
assert(pnpm, 'Run via pnpm check:standalone.');
const env = { ...process.env, CI: 'true' };
// Build-only synthetic configuration. No Firebase session or monetary execution.
Object.assign(env, { GATOPAGO_ENVIRONMENT: 'staging', GATOPAGO_WEB_ORIGIN: 'https://staging.gatopago.com',
  GATOPAGO_API_ORIGIN: 'https://api.staging.gatopago.com', GATOPAGO_BUSINESS_ORIGIN: 'https://business.staging.gatopago.com',
  GATOPAGO_WALLET_NETWORKS: 'eip155:421614', FIREBASE_PROJECT_ID: 'v3-build-test',
  GATOPAGO_FIREBASE_WEB_API_KEY: 'AIza' + 'x'.repeat(35), GATOPAGO_FIREBASE_WEB_APP_ID: '1:123456789:web:0000000000000000000000',
  GATOPAGO_TURNSTILE_SITE_KEY: '0x00000000000000000000FAKE' });
function run(...args) { execFileSync(process.execPath, [pnpm, ...args], { cwd: destination, stdio: 'inherit', env }); }
run('install', '--frozen-lockfile', '--prefer-offline');
if (values.project === 'contracts') run('install:solidity');
run('verify');
if (values.project !== 'contracts') run('audit', '--prod');
console.log(`Standalone verification passed: ${values.project}. Scratch directory retained for inspection; no deployment.`);
