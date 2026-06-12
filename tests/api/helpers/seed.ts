/**
 * D1 seed/teardown utilities for API E2E tests.
 *
 * Talks to the local wrangler dev D1 proxy on 127.0.0.1:8788 (see
 * scripts/test-stack.ts). No remote Cloudflare HTTP API calls — every query
 * goes through the same proxy endpoint the application uses, so tests
 * exercise the production code path end-to-end.
 */
import { nanoid } from 'nanoid';
import { unwrap } from '../../test-utils';

// ---------------------------------------------------------------------------
// Worker proxy access (must point at the local stack — no remote URLs allowed)
// ---------------------------------------------------------------------------

function proxyCredentials(): { url: string; secret: string } {
  const url = process.env.D1_PROXY_URL;
  const secret = process.env.D1_PROXY_SECRET;
  if (!url || !secret) {
    throw new Error(
      'D1_PROXY_URL / D1_PROXY_SECRET not set. The L2 runner (scripts/run-api-e2e.ts) must call applyLocalStackEnv() first.',
    );
  }
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error(
      `D1_PROXY_URL must point to the local wrangler dev (127.0.0.1/localhost). Got: ${url}. ` +
      'Refusing to run destructive seed/teardown against a remote target.',
    );
  }
  return { url, secret };
}

function endpoint(base: string, path: string): string {
  return base.endsWith('/') ? `${base}${path.replace(/^\//, '')}` : `${base}${path}`;
}

interface D1QueryResponse {
  success: boolean;
  results?: unknown[];
  error?: string;
}

interface D1BatchResponse {
  success: boolean;
  results?: Array<{ results: unknown[] }>;
  error?: string;
}

export async function executeD1(sql: string, params: unknown[] = []): Promise<void> {
  const { url, secret } = proxyCredentials();
  const res = await fetch(endpoint(url, '/api/d1-query'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`D1 proxy HTTP error ${res.status}: ${body}`);
  }
  const data = (await res.json()) as D1QueryResponse;
  if (!data.success) {
    throw new Error(`D1 proxy error: ${data.error ?? 'unknown'} (sql: ${sql.slice(0, 80)})`);
  }
}

export async function queryD1<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { url, secret } = proxyCredentials();
  const res = await fetch(endpoint(url, '/api/d1-query'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`D1 proxy HTTP error ${res.status}: ${body}`);
  }
  const data = (await res.json()) as D1QueryResponse;
  if (!data.success) {
    throw new Error(`D1 proxy error: ${data.error ?? 'unknown'} (sql: ${sql.slice(0, 80)})`);
  }
  return (data.results ?? []) as T[];
}

async function batchD1(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  const { url, secret } = proxyCredentials();
  const res = await fetch(endpoint(url, '/api/d1-batch'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ statements }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`D1 proxy batch HTTP error ${res.status}: ${body}`);
  }
  const data = (await res.json()) as D1BatchResponse;
  if (!data.success) {
    throw new Error(`D1 proxy batch error: ${data.error ?? 'unknown'}`);
  }
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

/** Insert a link into D1 and return the slug + auto-id (single round trip via RETURNING). */
export async function seedLink(options: SeedLinkOptions = {}): Promise<{ slug: string; id: number }> {
  const slug = options.slug ?? testSlug();
  const originalUrl = options.originalUrl ?? 'https://example.com';
  const userId = options.userId ?? TEST_USER.id;
  const isCustom = options.isCustom ?? true;
  const clicks = options.clicks ?? 0;
  const expiresAt = options.expiresAt ?? null;
  const now = new Date().toISOString();

  const rows = await queryD1<{ id: number }>(
    `INSERT INTO links (user_id, folder_id, original_url, slug, is_custom, clicks, expires_at, created_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [userId, originalUrl, slug, isCustom ? 1 : 0, clicks, expiresAt, now],
  );
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

/** Insert an upload into D1 and return the upload info (single round trip via RETURNING). */
export async function seedUpload(userId?: string, options: SeedUploadOptions = {}): Promise<{ id: number; key: string }> {
  const uid = userId ?? TEST_USER.id;
  const key = options.key ?? `test-uploads/${nanoid(8)}.txt`;
  const fileName = options.fileName ?? 'test-file.txt';
  const fileType = options.fileType ?? 'text/plain';
  const fileSize = options.fileSize ?? 1024;
  const publicUrl = options.publicUrl ?? `https://cdn.example.com/${key}`;
  const now = Math.floor(Date.now() / 1000);

  const rows = await queryD1<{ id: number }>(
    `INSERT INTO uploads (user_id, key, file_name, file_type, file_size, public_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [uid, key, fileName, fileType, fileSize, publicUrl, now],
  );
  if (rows.length === 0) throw new Error(`Seeded upload not found: ${key}`);
  return { id: unwrap(rows[0]).id, key };
}

// ---------------------------------------------------------------------------
// Idea helpers
// ---------------------------------------------------------------------------

export interface SeedIdeaOptions {
  userId?: string;
  title?: string | null;
  content?: string;
  tagIds?: string[];
}

/** Insert an idea into D1 and return the idea info. */
export async function seedIdea(
  userId?: string,
  options: SeedIdeaOptions = {},
): Promise<{ id: number; title: string | null; content: string }> {
  const uid = userId ?? TEST_USER.id;
  const title = options.title === undefined ? null : options.title;
  const content = options.content ?? `Test idea content ${nanoid(8)}`;
  const excerpt = content.substring(0, 200);
  const now = Date.now();

  const rows = await queryD1<{ id: number }>(
    `INSERT INTO ideas (user_id, title, content, excerpt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [uid, title, content, excerpt, now, now],
  );
  if (rows.length === 0) throw new Error('Seeded idea not found');
  const id = unwrap(rows[0]).id;

  // Attach tags if provided
  if (options.tagIds && options.tagIds.length > 0) {
    for (const tagId of options.tagIds) {
      await executeD1(
        'INSERT INTO idea_tags (idea_id, tag_id) VALUES (?, ?)',
        [id, tagId],
      );
    }
  }

  return { id, title, content };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Delete all test data owned by the test user. Analytics cascade automatically. */
export async function cleanupTestData(userId?: string): Promise<void> {
  const uid = userId ?? TEST_USER.id;
  // Single round trip via the worker proxy /api/d1-batch endpoint. The proxy
  // is the only D1 path in production, so this also exercises that surface.
  await batchD1([
    { sql: 'DELETE FROM api_audit_logs WHERE user_id = ?', params: [uid] },
    { sql: 'DELETE FROM api_keys WHERE user_id = ?', params: [uid] },
    // idea_tags is cleaned up by CASCADE on ideas delete
    { sql: 'DELETE FROM ideas WHERE user_id = ?', params: [uid] },
    { sql: 'DELETE FROM tags WHERE user_id = ?', params: [uid] },
    { sql: 'DELETE FROM links WHERE user_id = ?', params: [uid] },
    { sql: 'DELETE FROM folders WHERE user_id = ?', params: [uid] },
    { sql: 'DELETE FROM webhooks WHERE user_id = ?', params: [uid] },
    { sql: 'DELETE FROM uploads WHERE user_id = ?', params: [uid] },
    { sql: 'DELETE FROM user_settings WHERE user_id = ?', params: [uid] },
  ]);
  // If a custom user was created, clean it up too
  if (userId && userId !== TEST_USER.id) {
    await executeD1('DELETE FROM users WHERE id = ?', [uid]);
  }
}

/**
 * Combined cleanup + user seed in a single D1 round trip.
 * Saves ~200ms per test file by avoiding the second HTTP call.
 */
export async function resetAndSeedUser(userId: string): Promise<void> {
  const name = `Test User ${userId}`;
  const email = `${userId}@test.local`;
  await batchD1([
    { sql: 'DELETE FROM api_audit_logs WHERE user_id = ?', params: [userId] },
    { sql: 'DELETE FROM api_keys WHERE user_id = ?', params: [userId] },
    { sql: 'DELETE FROM ideas WHERE user_id = ?', params: [userId] },
    { sql: 'DELETE FROM tags WHERE user_id = ?', params: [userId] },
    { sql: 'DELETE FROM links WHERE user_id = ?', params: [userId] },
    { sql: 'DELETE FROM folders WHERE user_id = ?', params: [userId] },
    { sql: 'DELETE FROM webhooks WHERE user_id = ?', params: [userId] },
    { sql: 'DELETE FROM uploads WHERE user_id = ?', params: [userId] },
    { sql: 'DELETE FROM user_settings WHERE user_id = ?', params: [userId] },
    {
      sql: 'INSERT OR IGNORE INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, NULL, NULL)',
      params: [userId, name, email],
    },
  ]);
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
