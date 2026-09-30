import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditImports, auditIdentityBoundary, sourceImports } from './check-wallet-flow-boundaries.mjs';

test('Firebase identifiers and token verification stay inside Wallet Core auth', () => {
  const path = 'gatopago-wallet-core/src/creation/jobs.ts';
  for (const source of ['env.FIREBASE_PROJECT_ID', 'const sql = "u.firebase_project_id = ?"',
    "import { verifyConsumerIdentity } from '../auth/identity'", 'config.firebaseProjectId']) {
    assert.throws(() => auditIdentityBoundary(source, path), /Provider identity escaped auth/);
    assert.doesNotThrow(() => auditIdentityBoundary(source, 'gatopago-wallet-core/src/auth/session.ts'));
  }
  auditIdentityBoundary("// env.FIREBASE_PROJECT_ID\nimport type { Principal } from '../auth/principal';", path);
});

test('parser counts re-exports, type imports and dynamic imports, ignoring comments', () => {
  assert.deepEqual(sourceImports(`// import './ignored';
    export * from './barrel'; import type { A } from './types';
    type B = import('./other').B; const load = () => import('./lazy');`),
  ['./barrel', './types', './other', './lazy']);
  assert.throws(() => sourceImports('import(path)'), /Non-literal/);
  assert.throws(() => sourceImports('require(path)'), /Non-literal/);
});

test('Flow cannot acquire V2 account dependencies through an allowed transitive module', () => {
  const files = {
    'gatopago-flow/src/index.ts': "import '@gatopago/shared/payment-networks';",
    'shared/paymentNetworks.ts': "export * from './index';",
  };
  assert.throws(() => auditImports(['gatopago-flow/src/index.ts'], {
    domain: 'flow', dependencies: new Set(), read: (path) => files[path],
    resolveImport: (path) => path.startsWith('gatopago-flow/') ? 'shared/paymentNetworks.ts' : 'shared/index.ts',
  }), /forbidden source: shared\/paymentNetworks.ts -> shared\/index.ts/);
});

test('Wallet Core cannot depend on a legacy service or Flow implementation', () => {
  for (const target of ['contracts/legacy/src/AccountWebAuthnV2.sol', 'gatopago-flow/src/repositories/payments.ts']) {
    assert.throws(() => auditImports(['gatopago-wallet-core/src/index.ts'], {
      domain: 'wallet', dependencies: new Set(), read: () => "export * from '../legacy';",
      resolveImport: () => target,
    }), /forbidden source|Cross-package relative import/);
  }
});

test('workspace package aliases cannot hide the shared legacy barrel', () => {
  assert.throws(() => auditImports(['gatopago-wallet-core/src/index.ts'], {
    domain: 'wallet', dependencies: new Set(['@gatopago/shared']),
    read: () => "import '@gatopago/shared';", resolveImport: () => 'shared/index.ts',
  }), /forbidden source/);
});

test('both domains may depend on bounded HTTP without depending on each other', () => {
  for (const [domain, entry] of [['wallet', 'gatopago-wallet-core/src/index.ts'], ['flow', 'gatopago-flow/src/index.ts']]) {
    assert.deepEqual(auditImports([entry], {
      domain, dependencies: new Set(), read: (path) => path === entry ? "import '@gatopago/shared/http';" : '',
      resolveImport: () => 'shared/http.ts',
    }), [entry, 'shared/http.ts'].sort());
  }
});

test('even allowed shared modules require an explicit package interface', () => {
  assert.throws(() => auditImports(['gatopago-wallet-core/src/index.ts'], {
    domain: 'wallet', dependencies: new Set(), read: () => "import '../../shared/http';",
    resolveImport: () => 'shared/http.ts',
  }), /Cross-package relative import/);
});

test('Flow can validate internal IDs without acquiring wallet policy or chain inspection', () => {
  const entry = 'gatopago-flow/src/middlewares/auth.ts';
  const options = target => ({ domain: 'flow', dependencies: new Set(),
    read: path => path === entry ? "import '@gatopago/shared/v3/primitives';" : '', resolveImport: () => target });
  assert.deepEqual(auditImports([entry], options('shared/v3/primitives.ts')), [entry, 'shared/v3/primitives.ts']);
  for (const target of ['shared/v3/securityPolicy.ts', 'gatopago-wallet-core/src/auth/identity.ts']) {
    assert.throws(() => auditImports([entry], options(target)), /forbidden source/);
  }
});
