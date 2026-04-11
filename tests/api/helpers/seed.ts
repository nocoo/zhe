/**
 * D1 seed/teardown utilities for API E2E tests.
 *
 * Uses the Cloudflare D1 HTTP API to directly manage test data
 * in the remote D1 database — no in-process mocks involved.
 *
 * Reuses the same D1 HTTP helpers pattern from Playwright helpers.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { nanoid } from 'nanoid';
import { unwrap } from '../../test-utils';

// ---------------------------------------------------------------------------
// Env loading (same pattern as Playwright)
// ---------------------------------------------------------------------------

let envLoaded = false;

function ensureEnv(): void {
  if (envLoaded) return;
  envLoaded = true;

  const envPath = resolve(process.cwd(), '.env.local');
  let content: string;
  try {
    content = readFileSync(envPath, 'utf-8');
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
    } else {
      // Strip inline comments for unquoted values (e.g. KEY=value # comment)
      const commentIdx = value.indexOf(' #');
      if (commentIdx >= 0) value = value.slice(0, commentIdx).trim();
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// D1 HTTP API
// ---------------------------------------------------------------------------

function d1Credentials(): { accountId: string; databaseId: string; token: string } {
  ensureEnv();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !token) {
    throw new Error('D1 credentials not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN in .env.local');
  }

  // Safety: require D1_TEST_DATABASE_ID to exist.
  // main() in run-api-e2e.ts has already verified testDbId !== prodDbId
  // and overridden CLOUDFLARE_D1_DATABASE_ID to point to the test database.
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    throw new Error(
      'D1_TEST_DATABASE_ID not set. This guard prevents running destructive seed/teardown against production. ' +
      'Set D1_TEST_DATABASE_ID in .env.local to the dedicated test D1 database UUID.',
    );
  }
  if (testDbId !== databaseId) {
    throw new Error(
      `D1 safety check: CLOUDFLARE_D1_DATABASE_ID (${databaseId}) !== D1_TEST_DATABASE_ID (${testDbId}). ` +
      'run-api-e2e.ts should have overridden this. Refusing to write to a non-test database.',
    );
  }

  return { accountId, databaseId, token };
}

export async function executeD1(sql: string, params: unknown[] = []): Promise<void> {
  const { accountId, databaseId, token } = d1Credentials();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

export async function queryD1<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { accountId, databaseId, token } = d1Credentials();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
  return (data.result?.[0]?.results ?? []) as T[];
}

// ---------------------------------------------------------------------------
// Test user
// ---------------------------------------------------------------------------

export const TEST_USER = {
  id: 'api-e2e-test-user',
  name: 'API E2E Test User',
  email: 'api-e2e@test.local',
} as const;

/** Ensure the test user exists in D1 (INSERT OR IGNORE). */
export async function ensureTestUser(): Promise<void> {
  await executeD1(
    'INSERT OR IGNORE INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, NULL, NULL)',
    [TEST_USER.id, TEST_USER.name, TEST_USER.email],
  );
}

// ---------------------------------------------------------------------------
// Link helpers
// ---------------------------------------------------------------------------

/** Generate a unique lowercase slug with a test prefix to avoid collisions. */
export function testSlug(prefix = 'api-e2e'): string {
  return `${prefix}-${nanoid(8)}`.toLowerCase();
}

export interface SeedLinkOptions {
  slug?: string;
  originalUrl?: string;
  userId?: string;
  isCustom?: boolean;
  clicks?: number;
  expiresAt?: string | null;
}

/** Insert a link into D1 and return the slug. */
export async function seedLink(options: SeedLinkOptions = {}): Promise<{ slug: string; id: number }> {
  const slug = options.slug ?? testSlug();
  const originalUrl = options.originalUrl ?? 'https://example.com';
  const userId = options.userId ?? TEST_USER.id;
  const isCustom = options.isCustom ?? true;
  const clicks = options.clicks ?? 0;
  const expiresAt = options.expiresAt ?? null;
  const now = new Date().toISOString();

  await executeD1(
    `INSERT INTO links (user_id, folder_id, original_url, slug, is_custom, clicks, expires_at, created_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    [userId, originalUrl, slug, isCustom ? 1 : 0, clicks, expiresAt, now],
  );

  // Retrieve the auto-generated ID
  const rows = await queryD1<{ id: number }>('SELECT id FROM links WHERE slug = ?', [slug]);
  if (rows.length === 0) throw new Error(`Seeded link not found: ${slug}`);
  return { slug, id: unwrap(rows[0]).id };
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

export interface SeedWebhookOptions {
  userId?: string;
  rateLimit?: number;
}

/** Insert a webhook into D1 and return the token. */
export async function seedWebhook(options: SeedWebhookOptions = {}): Promise<{ token: string; userId: string }> {
  const userId = options.userId ?? TEST_USER.id;
  const rateLimit = options.rateLimit ?? 60;
  const token = `wh-${nanoid(16)}`;
  const now = Math.floor(Date.now() / 1000);

  // Delete existing webhook for user first (unique constraint on user_id)
  await executeD1('DELETE FROM webhooks WHERE user_id = ?', [userId]);
  await executeD1(
    'INSERT INTO webhooks (user_id, token, rate_limit, created_at) VALUES (?, ?, ?, ?)',
    [userId, token, rateLimit, now],
  );

  return { token, userId };
}

// ---------------------------------------------------------------------------
// Folder helpers
// ---------------------------------------------------------------------------

/** Insert a folder into D1 and return the folder id. */
export async function seedFolder(name: string, userId?: string): Promise<string> {
  const uid = userId ?? TEST_USER.id;
  const id = `folder-${nanoid(8)}`;
  const now = Math.floor(Date.now() / 1000);

  await executeD1(
    'INSERT INTO folders (id, user_id, name, icon, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, uid, name, 'folder', now],
  );

  return id;
}

// ---------------------------------------------------------------------------
// Backy pull webhook helpers
// ---------------------------------------------------------------------------

/** Seed a backy pull key in user_settings and return the key. */
export async function seedBackyPullKey(userId?: string): Promise<string> {
  const uid = userId ?? TEST_USER.id;
  const key = `bpk-${nanoid(16)}`;

  // Upsert user_settings with the backy pull key
  await executeD1(
    `INSERT INTO user_settings (user_id, backy_pull_key, preview_style)
     VALUES (?, ?, 'favicon')
     ON CONFLICT(user_id) DO UPDATE SET backy_pull_key = excluded.backy_pull_key`,
    [uid, key],
  );

  return key;
}

/** Seed backy push config (webhookUrl + apiKey) in user_settings. */
export async function seedBackyPushConfig(
  webhookUrl: string,
  apiKey: string,
  userId?: string,
): Promise<void> {
  const uid = userId ?? TEST_USER.id;

  await executeD1(
    `INSERT INTO user_settings (user_id, backy_webhook_url, backy_api_key, preview_style)
     VALUES (?, ?, ?, 'favicon')
     ON CONFLICT(user_id) DO UPDATE SET
       backy_webhook_url = excluded.backy_webhook_url,
       backy_api_key = excluded.backy_api_key`,
    [uid, webhookUrl, apiKey],
  );
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

export interface SeedTagOptions {
  userId?: string;
  name?: string;
  color?: string;
}

/** Insert a tag into D1 and return the tag info. */
export async function seedTag(userId?: string, options: SeedTagOptions = {}): Promise<{ id: string; name: string }> {
  const uid = userId ?? TEST_USER.id;
  const id = `tag-${nanoid(8)}`;
  const name = options.name ?? `Test Tag ${nanoid(4)}`;
  const color = options.color ?? '#ff5500';
  const now = Math.floor(Date.now() / 1000);

  await executeD1(
    `INSERT INTO tags (id, user_id, name, color, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, uid, name, color, now],
  );

  return { id, name };
}

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

export interface SeedUploadOptions {
  userId?: string;
  key?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  publicUrl?: string;
}

/** Insert an upload into D1 and return the upload info. */
export async function seedUpload(userId?: string, options: SeedUploadOptions = {}): Promise<{ id: number; key: string }> {
  const uid = userId ?? TEST_USER.id;
  const key = options.key ?? `test-uploads/${nanoid(8)}.txt`;
  const fileName = options.fileName ?? 'test-file.txt';
  const fileType = options.fileType ?? 'text/plain';
  const fileSize = options.fileSize ?? 1024;
  const publicUrl = options.publicUrl ?? `https://cdn.example.com/${key}`;
  const now = Math.floor(Date.now() / 1000);

  await executeD1(
    `INSERT INTO uploads (user_id, key, file_name, file_type, file_size, public_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uid, key, fileName, fileType, fileSize, publicUrl, now],
  );

  // Retrieve the auto-generated ID
  const rows = await queryD1<{ id: number }>('SELECT id FROM uploads WHERE key = ?', [key]);
  if (rows.length === 0) throw new Error(`Seeded upload not found: ${key}`);
  return { id: unwrap(rows[0]).id, key };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Delete all test data owned by the test user. Analytics cascade automatically. */
export async function cleanupTestData(userId?: string): Promise<void> {
  const uid = userId ?? TEST_USER.id;
  await executeD1('DELETE FROM api_audit_logs WHERE user_id = ?', [uid]);
  await executeD1('DELETE FROM api_keys WHERE user_id = ?', [uid]);
  await executeD1('DELETE FROM tags WHERE user_id = ?', [uid]);
  await executeD1('DELETE FROM links WHERE user_id = ?', [uid]);
  await executeD1('DELETE FROM folders WHERE user_id = ?', [uid]);
  await executeD1('DELETE FROM webhooks WHERE user_id = ?', [uid]);
  await executeD1('DELETE FROM uploads WHERE user_id = ?', [uid]);
  await executeD1('DELETE FROM user_settings WHERE user_id = ?', [uid]);
  // If a custom user was created, clean it up too
  if (userId && userId !== TEST_USER.id) {
    await executeD1('DELETE FROM users WHERE id = ?', [uid]);
  }
}

// ---------------------------------------------------------------------------
// API Key helpers
// ---------------------------------------------------------------------------

import { createHash, randomBytes } from 'crypto';

/** Hash an API key using SHA-256 (matches models/api-key.ts). */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export interface SeedApiKeyOptions {
  name?: string;
  scopes?: string;
}

/**
 * Seed an API key for a user and return the full key (plaintext).
 * This is the only time the full key is available.
 */
export async function seedApiKey(userId: string, options: SeedApiKeyOptions = {}): Promise<string> {
  const name = options.name ?? 'Test API Key';
  const scopes = options.scopes ?? 'links:read,links:write';

  // Generate a full API key
  const randomPart = randomBytes(24).toString('base64url');
  const fullKey = `zhe_${randomPart}`;
  const prefix = fullKey.substring(0, 12);
  const keyHash = hashApiKey(fullKey);
  const id = `key-${nanoid(8)}`;
  const now = Math.floor(Date.now() / 1000);

  await executeD1(
    `INSERT INTO api_keys (id, prefix, key_hash, user_id, name, scopes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, prefix, keyHash, userId, name, scopes, now],
  );

  return fullKey;
}

/**
 * Seed a test user with a specific ID.
 * Use this when you need isolated test data per test suite.
 */
export async function seedTestUser(userId: string): Promise<void> {
  await executeD1(
    'INSERT OR IGNORE INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, NULL, NULL)',
    [userId, `Test User ${userId}`, `${userId}@test.local`],
  );
}
