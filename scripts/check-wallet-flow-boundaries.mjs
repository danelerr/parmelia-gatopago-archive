import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const ts = createRequire(resolve(root, 'gatopago-wallet-core/package.json'))('typescript');
const relativePath = (path) => relative(root, path).split(sep).join('/');
const paymentModules = new Set(['paymentErrors', 'fees', 'http', 'paymentNetworks', 'paymentAbis', 'paymentAuthorizations', 'paymentContracts']
  .map((name) => `shared/${name}.ts`));
const paymentArtifacts = new Set(['GatoPagoPaymentRouter', 'GatoPagoCctpPaymentRouter', 'GatoPagoCrosschainRouter']
  .map((name) => `shared/abis/${name}.json`));
const sourcePackage = path => path.startsWith('packages/') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0];

function allowedSource(domain, path) {
  if (domain === 'wallet') return path.startsWith('gatopago-wallet-core/src/') || path.startsWith('shared/v3/')
    || path.startsWith('packages/environment/') || path === 'shared/http.ts';
  assert.equal(domain, 'flow');
  return path.startsWith('gatopago-flow/src/') || paymentModules.has(path) || paymentArtifacts.has(path)
    || path === 'shared/v3/primitives.ts';
}

// Parse the AST: comments are not dependencies; re-exports, type imports and literal
// dynamic imports all count. Non-literal loaders cannot establish a static boundary.
export function sourceImports(source, path = 'source.ts') {
  const imports = new Set();
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function add(node) {
    assert(node && ts.isStringLiteralLike(node), `Non-literal module loader in ${path}`);
    imports.add(node.text);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node)) {
      assert(ts.isLiteralTypeNode(node.argument), `Non-literal import type in ${path}`);
      add(node.argument.literal);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...imports];
}

export function auditIdentityBoundary(source, path) {
  if (path.startsWith('gatopago-wallet-core/src/auth/')) return;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
      assert(!/FIREBASE_|firebaseProjectId|firebase_project_id|firebase_subject|verifyConsumerIdentity/u.test(node.text),
        `Provider identity escaped auth: ${path}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}

export function auditImports(entries, { domain, read, resolveImport, dependencies }) {
  const visited = new Set();
  function visit(path, parent) {
    assert(allowedSource(domain, path), `${domain} depends on forbidden source: ${parent} -> ${path}`);
    if (visited.has(path)) return;
    visited.add(path);
    if (path.endsWith('.json')) return;
    for (const specifier of sourceImports(read(path), path)) {
      if (specifier.startsWith('.') || specifier.startsWith('@gatopago/')) {
        const target = resolveImport(path, specifier);
        if (specifier.startsWith('.')) assert.equal(sourcePackage(path), sourcePackage(target),
          `Cross-package relative import: ${path} -> ${specifier}; use an explicit package export`);
        visit(target, path);
      }
      else {
        const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
        assert(dependencies.has(name), `Undeclared ${domain} dependency: ${path} -> ${specifier}`);
      }
    }
  }
  for (const path of entries) visit(path, 'runtime');
  return [...visited].sort();
}

function sources(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    assert(!entry.isSymbolicLink(), `Symlink in source inventory: ${directory}/${entry.name}`);
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sources(path) : /\.[cm]?[jt]s$/.test(path) ? [path] : [];
  });
}

function resolveImport(path, specifier) {
  let base;
  if (specifier.startsWith('@gatopago/')) {
    const [scope, name, ...subpath] = specifier.split('/');
    const directory = ({ '@gatopago/shared': 'shared', '@gatopago/environment': 'packages/environment' })[`${scope}/${name}`];
    assert(directory, `Unknown workspace dependency: ${specifier}`);
    const pkg = JSON.parse(readFileSync(resolve(root, directory, 'package.json'), 'utf8'));
    const exported = pkg.exports?.[subpath.length ? `./${subpath.join('/')}` : '.'];
    const entry = typeof exported === 'string' ? exported : exported?.import ?? exported?.default;
    assert(typeof entry === 'string', `Missing runtime workspace export: ${specifier}`);
    base = resolve(root, directory, entry);
  } else base = resolve(root, dirname(path), specifier);
  const target = [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, `${base}.json`, resolve(base, 'index.ts')]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  assert(target, `Unresolved local dependency: ${path} -> ${specifier}`);
  const resolved = realpathSync(target);
  assert.equal(resolved, target, `Source dependency traverses a symlink: ${path} -> ${specifier}`);
  return relativePath(resolved);
}

function config(path) {
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(resolve(root, path), 'utf8'));
  assert(!parsed.error, `Invalid JSONC: ${path}`);
  return parsed.config;
}

export function checkBoundaries() {
  const wallet = config('gatopago-wallet-core/wrangler.jsonc'), flow = config('gatopago-flow/wrangler.jsonc');
  assert.equal(wallet.main, 'src/index.ts');
  assert.equal(flow.main, 'src/index.ts');
  assert.deepEqual(wallet.d1_databases.map((db) => db.binding), ['WALLET_DB']);
  assert.deepEqual(flow.d1_databases.map((db) => db.binding), ['PAYMENTS_DB']);
  assert.notEqual(wallet.d1_databases[0].database_id, flow.d1_databases[0].database_id);
  // Only consumer session admission crosses this boundary. Anonymous checkout,
  // settlement, reconciliation and API keys remain independent of Wallet Core.
  assert.deepEqual(flow.services, [{ binding: 'WALLET_IDENTITY', service: wallet.name, entrypoint: 'WalletIdentity' }],
    'Flow may bind only to the private WalletIdentity entrypoint');
  assert.equal(flow.vars.GATOPAGO_ENVIRONMENT, wallet.vars.GATOPAGO_ENVIRONMENT, 'Identity binding crosses environments');
  assert(!('FIREBASE_PROJECT_ID' in flow.vars), 'Flow must not verify Firebase independently');
  for (const path of sources('gatopago-flow/src')) {
    if (path !== 'gatopago-flow/src/middlewares/auth.ts') {
      assert(!/\bWALLET_IDENTITY\b/.test(readFileSync(resolve(root, path), 'utf8')) || path === 'gatopago-flow/src/env.ts',
        `Private identity binding escaped authentication: ${path}`);
    }
  }
  const queues = (worker) => [...(worker.queues?.producers ?? []), ...(worker.queues?.consumers ?? [])]
    .flatMap((queue) => [queue.queue, queue.dead_letter_queue].filter(Boolean));
  assert(queues(wallet).length && queues(flow).length, 'Both domains need explicit queue ownership');
  assert(queues(wallet).every((queue) => !queues(flow).includes(queue)), 'Domains share a queue or DLQ');
  for (const configuration of [flow, config('gatopago-flow/wrangler.test.jsonc').env['runtime-test']]) {
    const queue = configuration.vars.PAYMENT_JOBS_QUEUE_NAME;
    assert(queue && configuration.queues.producers.some(q => q.binding === 'PAYMENT_JOBS_QUEUE' && q.queue === queue)
      && configuration.queues.consumers.some(q => q.queue === queue), 'Flow queue transport differs from its configuration');
  }
  assert(wallet.queues.producers.some(q => q.binding === 'CREATION_JOBS' && q.queue === wallet.vars.CREATION_QUEUE_NAME)
    && wallet.queues.consumers.some(q => q.queue === wallet.vars.CREATION_QUEUE_NAME), 'Wallet queue transport differs from its configuration');


  const inventory = {};
  const shared = JSON.parse(readFileSync(resolve(root, 'shared/package.json'), 'utf8'));
  for (const [domain, directory] of [['wallet', 'gatopago-wallet-core'], ['flow', 'gatopago-flow']]) {
    const pkg = JSON.parse(readFileSync(resolve(root, directory, 'package.json'), 'utf8'));
    const dependencies = new Set([...Object.keys(pkg.dependencies), ...Object.keys(shared.dependencies),
      'cloudflare:workers', ...(domain === 'wallet' ? ['node:net'] : [])]);
    const entries = sources(`${directory}/src`);
    if (domain === 'wallet') for (const path of entries) auditIdentityBoundary(readFileSync(resolve(root, path), 'utf8'), path);
    inventory[domain] = auditImports(entries, {
      domain, dependencies, resolveImport, read: (path) => readFileSync(resolve(root, path), 'utf8'),
    });
  }
  console.log(`Wallet/Flow boundaries pass: ${inventory.wallet.length} Wallet Core files, ${inventory.flow.length} Flow files; transitive imports and infrastructure ownership checked.`);
  return inventory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkBoundaries();
