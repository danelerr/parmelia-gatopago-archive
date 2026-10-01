import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const PAYMENTS_DB_SENTINEL = '00000000-0000-0000-0000-000000000002';
const defaultConfigPath = resolve(import.meta.dirname, '../gatopago-flow/wrangler.remote.jsonc');

export function validateFlowDeployConfig(config) {
  const databaseId = config.match(/"binding"\s*:\s*"PAYMENTS_DB"[\s\S]{0,800}?"database_id"\s*:\s*"([^"]+)"/u)?.[1];
  if (!databaseId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(databaseId)) {
    throw new Error('Flow requires an explicit PAYMENTS_DB UUID.');
  }
  if (databaseId === PAYMENTS_DB_SENTINEL) throw new Error('Flow PAYMENTS_DB is a local-only sentinel; provision its fresh schema before deployment.');
  return databaseId;
}
function assertFlowDeployConfig(configPath = defaultConfigPath) {
  return validateFlowDeployConfig(readFileSync(configPath, 'utf8'));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) assertFlowDeployConfig();
