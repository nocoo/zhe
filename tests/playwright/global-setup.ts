/**
 * Playwright global setup: ensure the E2E test user exists in D1.
 *
 * Calls the Cloudflare D1 HTTP API directly to INSERT OR IGNORE
 * the test user so that FK constraints on links/folders/etc. pass.
 *
 * Requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and
 * CLOUDFLARE_API_TOKEN to be set (loaded from .env.local).
 */
import { resolve } from 'path';
import { loadEnvFile, executeD1, TEST_USER } from './helpers/d1';

export default async function globalSetup(): Promise<void> {
  // Load .env.local so D1 credentials are available
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  console.log('[pw:global-setup] Ensuring E2E test user exists in D1...');

  await executeD1(
    'INSERT OR IGNORE INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, NULL, NULL)',
    [TEST_USER.id, TEST_USER.name, TEST_USER.email],
  );

  console.log('[pw:global-setup] Done.');
}
