/**
 * Playwright global teardown: clean up data created by E2E tests.
 *
 * Deletes all links (and cascade-related analytics, link_tags) owned
 * by the E2E test user. The test user row itself is kept so that
 * subsequent runs don't need to re-insert it.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Minimal .env parser — handles KEY=VALUE, ignoring comments and blank lines. */
function loadEnvFile(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function executeD1(sql: string, params: unknown[] = []): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    console.warn('[pw:global-teardown] D1 credentials not set — skipping cleanup.');
    return;
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`[pw:global-teardown] D1 HTTP error ${res.status}: ${body}`);
    return;
  }

  const data = await res.json();
  if (!data.success) {
    const detail = (data.errors ?? []).map((e: { message: string }) => e.message).join(', ');
    console.error(`[pw:global-teardown] D1 query error: ${detail}`);
  }
}

const TEST_USER_ID = 'e2e-test-user-id';

export default async function globalTeardown(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  console.log('[pw:global-teardown] Cleaning up E2E test data...');

  // Delete links (analytics + link_tags cascade automatically)
  await executeD1('DELETE FROM links WHERE user_id = ?', [TEST_USER_ID]);

  // Delete folders
  await executeD1('DELETE FROM folders WHERE user_id = ?', [TEST_USER_ID]);

  // Delete tags
  await executeD1('DELETE FROM tags WHERE user_id = ?', [TEST_USER_ID]);

  console.log('[pw:global-teardown] Done.');
}
