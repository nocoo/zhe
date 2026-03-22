/**
 * Playwright global setup: environment isolation + ensure E2E test user.
 *
 * Performs four-layer safety checks before any D1 operation:
 * 1. Env override: D1_TEST_DATABASE_ID → CLOUDFLARE_D1_DATABASE_ID
 * 2. Inequality check: testDbId !== prodDbId
 * 3. Defensive guard in executeD1/queryD1 (helpers/d1.ts)
 * 4. _test_marker table verification
 *
 * L3 is an on-demand hard gate — missing test config = throw (not skip).
 */
import { resolve } from 'path';
import { loadEnvFile, executeD1, queryD1, TEST_USER } from './helpers/d1';

export default async function globalSetup(): Promise<void> {
  // Load .env.local so credentials are available
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  // ---- D1: hard gate ----
  const prodDbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    throw new Error(
      'D1_TEST_DATABASE_ID not set. Playwright E2E requires a dedicated test database.'
    );
  }
  if (testDbId === prodDbId) {
    throw new Error(
      `D1_TEST_DATABASE_ID === CLOUDFLARE_D1_DATABASE_ID (${prodDbId}). ` +
      'Test DB must differ from production DB.'
    );
  }
  process.env.CLOUDFLARE_D1_DATABASE_ID = testDbId;

  // ---- R2: hard gate ----
  const testBucket = process.env.R2_TEST_BUCKET_NAME;
  const testPublicDomain = process.env.R2_TEST_PUBLIC_DOMAIN;
  if (!testBucket || !testPublicDomain) {
    throw new Error(
      'R2_TEST_BUCKET_NAME and R2_TEST_PUBLIC_DOMAIN must both be set for Playwright E2E.'
    );
  }
  process.env.R2_BUCKET_NAME = testBucket;
  process.env.R2_PUBLIC_DOMAIN = testPublicDomain;

  // ---- KV: conditional hard gate ----
  if (process.env.CLOUDFLARE_KV_NAMESPACE_ID) {
    const testKvId = process.env.KV_TEST_NAMESPACE_ID;
    if (!testKvId) {
      throw new Error(
        'CLOUDFLARE_KV_NAMESPACE_ID is set but KV_TEST_NAMESPACE_ID is missing. ' +
        'Tests would write to production KV.'
      );
    }
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = testKvId;
  }

  // ---- _test_marker: last line of defense ----
  console.log('[pw:global-setup] Verifying _test_marker in test database...');
  const rows = await queryD1<{ value: string }>(
    "SELECT value FROM _test_marker WHERE key = 'env'"
  );
  if (rows?.[0]?.value !== 'test') {
    throw new Error(
      'FATAL: _test_marker check failed. The database does not contain a ' +
      '_test_marker row with value "test". Refusing to run E2E tests. ' +
      'Did you run Step 2 from docs/14-cloudflare-resource-inventory.md?'
    );
  }

  // ---- Ensure test user exists ----
  console.log('[pw:global-setup] Ensuring E2E test user exists in D1...');
  await executeD1(
    'INSERT OR IGNORE INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, NULL, NULL)',
    [TEST_USER.id, TEST_USER.name, TEST_USER.email],
  );

  console.log('[pw:global-setup] Done.');
}
