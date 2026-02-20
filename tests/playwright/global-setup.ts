/**
 * Playwright global setup: ensure the E2E test user exists in D1.
 *
 * Calls the Cloudflare D1 HTTP API directly to INSERT OR IGNORE
 * the test user so that FK constraints on links/folders/etc. pass.
 *
 * Requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and
 * CLOUDFLARE_API_TOKEN to be set (loaded from .env.local).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Minimal .env parser — handles KEY=VALUE, ignoring comments and blank lines. */
function loadEnvFile(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return; // file not found — rely on existing env vars
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const TEST_USER = {
  id: 'e2e-test-user-id',
  name: 'E2E Test User',
  email: 'e2e@test.local',
};

async function executeD1(sql: string, params: unknown[] = []): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    throw new Error(
      'D1 credentials not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.',
    );
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
    throw new Error(`D1 HTTP error ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!data.success) {
    const detail = (data.errors ?? []).map((e: { message: string }) => e.message).join(', ');
    throw new Error(`D1 query error: ${detail}`);
  }
}

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
