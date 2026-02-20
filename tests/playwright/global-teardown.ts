/**
 * Playwright global teardown: clean up data created by E2E tests.
 *
 * Deletes all links (and cascade-related analytics, link_tags) owned
 * by the E2E test user. The test user row itself is kept so that
 * subsequent runs don't need to re-insert it.
 *
 * Uses softFail mode — teardown should never mask actual test failures.
 */
import { resolve } from 'path';
import { loadEnvFile, executeD1, TEST_USER } from './helpers/d1';

export default async function globalTeardown(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  console.log('[pw:global-teardown] Cleaning up E2E test data...');

  // Delete links (analytics + link_tags cascade automatically)
  await executeD1('DELETE FROM links WHERE user_id = ?', [TEST_USER.id], { softFail: true });

  // Delete folders
  await executeD1('DELETE FROM folders WHERE user_id = ?', [TEST_USER.id], { softFail: true });

  // Delete tags
  await executeD1('DELETE FROM tags WHERE user_id = ?', [TEST_USER.id], { softFail: true });

  console.log('[pw:global-teardown] Done.');
}
