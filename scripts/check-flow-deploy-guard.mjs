import assert from 'node:assert/strict';
import { validateFlowDeployConfig, PAYMENTS_DB_SENTINEL } from './assert-flow-deploy-config.mjs';
const config = id => JSON.stringify({ d1_databases: [{ binding: 'PAYMENTS_DB', database_id: id }] });
const id = '11111111-2222-4333-8444-555555555555';
assert.equal(validateFlowDeployConfig(config(id)), id);
for (const invalid of ['{}', config('replace-me'), config(PAYMENTS_DB_SENTINEL)]) {
  assert.throws(() => validateFlowDeployConfig(invalid));
}
console.log('Flow deployment validates its own database, without an App or migration-import dependency.');
