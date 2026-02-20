/**
 * Shared D1 helpers for Playwright global setup/teardown.
 *
 * Provides env loading, D1 HTTP API access, and test constants
 * used by both global-setup.ts and global-teardown.ts.
 */
import { readFileSync } from 'fs';

/** E2E test user — must match the CredentialsProvider in auth.ts. */
export const TEST_USER = {
  id: 'e2e-test-user-id',
  name: 'E2E Test User',
  email: 'e2e@test.local',
} as const;

/** Minimal .env parser — handles KEY=VALUE, ignoring comments and blank lines. */
export function loadEnvFile(filePath: string): void {
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

export interface ExecuteD1Options {
  /** When true, log warnings instead of throwing on missing creds or errors. */
  softFail?: boolean;
}

/**
 * Execute a SQL query against Cloudflare D1 via the HTTP API.
 *
 * Requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and
 * CLOUDFLARE_API_TOKEN to be set in the environment.
 */
export async function executeD1(
  sql: string,
  params: unknown[] = [],
  options: ExecuteD1Options = {},
): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    const msg = 'D1 credentials not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.';
    if (options.softFail) {
      console.warn(`[pw:d1] ${msg} — skipping.`);
      return;
    }
    throw new Error(msg);
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
    const msg = `D1 HTTP error ${res.status}: ${body}`;
    if (options.softFail) {
      console.error(`[pw:d1] ${msg}`);
      return;
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data.success) {
    const detail = (data.errors ?? []).map((e: { message: string }) => e.message).join(', ');
    const msg = `D1 query error: ${detail}`;
    if (options.softFail) {
      console.error(`[pw:d1] ${msg}`);
      return;
    }
    throw new Error(msg);
  }
}
