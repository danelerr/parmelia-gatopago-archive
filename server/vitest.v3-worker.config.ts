import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    main: './src/v3/index.ts',
    wrangler: { configPath: './v3/wrangler.jsonc' },
    miniflare: {
      // Installed workerd's supported date; same restriction as the existing suite.
      compatibilityDate: '2026-07-08',
      bindings: {
        GATOPAGO_ENVIRONMENT: 'staging', FIREBASE_PROJECT_ID: 'v3-runtime-test',
        FIREBASE_WEB_API_KEY: `AIza${'t'.repeat(35)}`,
        TURNSTILE_SECRET_KEY: 'synthetic-turnstile-secret-for-tests',
        AUTH_RATE_LIMIT_PEPPER: 'synthetic-hmac-pepper-for-tests-only',
        V3_TEST_MIGRATIONS: await readD1Migrations(fileURLToPath(new URL('./v3/migrations', import.meta.url))),
      },
    },
  }))],
  // Bound simultaneous workerd/D1 fixtures. Unbounded file workers starve real
  // cryptographic tests on developer machines; in-test concurrency remains intact.
  test: { include: ['test-worker/v3/**/*.test.ts'], maxWorkers: 4 },
});
