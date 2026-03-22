/**
 * Playwright global teardown: clean up data created by E2E tests.
 *
 * Performs the same safety checks as global-setup.ts before any D1 operation.
 * Uses softFail mode — teardown should never mask actual test failures.
 */
import { resolve } from 'path';
import { loadEnvFile, executeD1, queryD1, TEST_USER } from './helpers/d1';

export default async function globalTeardown(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  // ---- D1: hard gate ----
  const prodDbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    throw new Error('D1_TEST_DATABASE_ID not set.');
  }
  if (testDbId === prodDbId) {
    throw new Error('D1_TEST_DATABASE_ID === CLOUDFLARE_D1_DATABASE_ID. Refusing teardown on prod.');
  }
  process.env.CLOUDFLARE_D1_DATABASE_ID = testDbId;

  // ---- R2: hard gate ----
  const testBucket = process.env.R2_TEST_BUCKET_NAME;
  const testPublicDomain = process.env.R2_TEST_PUBLIC_DOMAIN;
  if (!testBucket || !testPublicDomain) {
    throw new Error(
      'R2_TEST_BUCKET_NAME and R2_TEST_PUBLIC_DOMAIN must both be set for teardown.'
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
        'Refusing teardown to avoid touching production KV.'
      );
    }
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = testKvId;
  }

  // ---- _test_marker: last line of defense ----
  const rows = await queryD1<{ value: string }>(
    "SELECT value FROM _test_marker WHERE key = 'env'"
  );
  if (rows?.[0]?.value !== 'test') {
    throw new Error(
      'FATAL: _test_marker check failed. Refusing teardown on non-test database.'
    );
  }

  console.log('[pw:global-teardown] Cleaning up E2E test data...');

  // Delete links (analytics + link_tags cascade automatically)
  await executeD1('DELETE FROM links WHERE user_id = ?', [TEST_USER.id], { softFail: true });

  // Delete folders
  await executeD1('DELETE FROM folders WHERE user_id = ?', [TEST_USER.id], { softFail: true });

  // Delete tags
  await executeD1('DELETE FROM tags WHERE user_id = ?', [TEST_USER.id], { softFail: true });

  // Delete uploads
  await executeD1('DELETE FROM uploads WHERE user_id = ?', [TEST_USER.id], { softFail: true });

  // Delete webhooks
  await executeD1('DELETE FROM webhooks WHERE user_id = ?', [TEST_USER.id], { softFail: true });

  console.log('[pw:global-teardown] Done.');
}
