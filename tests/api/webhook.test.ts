/**
 * L2 API E2E Tests for /api/link/create/[token]
 *
 * Tests the webhook link creation API via real HTTP.
 * HEAD (connection test), GET (status/docs), POST (link creation).
 *
 * Seeded via D1 HTTP API — no in-process mocks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { apiGet, apiHead, apiPost, jsonResponse } from './helpers/http';
import {  seedWebhook, seedLink, seedFolder, cleanupTestData, resetAndSeedUser, testSlug } from './helpers/seed';
import { unwrap } from '../test-utils';

const TEST_USER_ID = 'api-webhook-test-user';
let webhookToken: string;

beforeAll(async () => {
  await resetAndSeedUser(TEST_USER_ID);
  const wh = await seedWebhook({ userId: TEST_USER_ID });
  webhookToken = wh.token;
});

afterAll(async () => {
  await cleanupTestData(TEST_USER_ID);
});

// ============================================================
// HEAD — Connection Test
// ============================================================
describe('HEAD /api/link/create/[token]', () => {
  it('returns 200 for a valid token', async () => {
    const res = await apiHead(`/api/link/create/${webhookToken}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for an invalid token', async () => {
    const res = await apiHead('/api/link/create/nonexistent-token');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// GET — Status & Documentation
// ============================================================
describe('GET /api/link/create/[token]', () => {
  it('returns 404 for an invalid token', async () => {
    const res = await apiGet('/api/link/create/bad-token');
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(404);
    expect(body.error).toBe('Invalid webhook token');
  });

  it('returns status, stats, and docs for a valid token', async () => {
    const res = await apiGet(`/api/link/create/${webhookToken}`);
    const { status, body } = await jsonResponse<{
      status: string;
      createdAt: string;
      rateLimit: number;
      stats: { totalLinks: number; totalClicks: number };
      docs: { openapi: string; servers: { url: string }[] };
    }>(res);

    expect(status).toBe(200);
    expect(body.status).toBe('active');
    expect(body.createdAt).toBeDefined();
    expect(body.rateLimit).toBeGreaterThan(0);
    expect(body.stats).toBeDefined();
    expect(body.docs.openapi).toBe('3.1.0');
    expect(body.docs.servers[0]).toBeDefined();
    expect(unwrap(body.docs.servers[0]).url).toContain(`/api/link/create/${webhookToken}`);
  });
});

// ============================================================
// POST — Link Creation
// ============================================================
describe('POST /api/link/create/[token]', () => {
  it('returns 404 for an invalid token', async () => {
    const res = await apiPost('/api/link/create/fake-token', { url: 'https://example.com' });
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(404);
    expect(body.error).toBe('Invalid webhook token');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await fetch(
      `${process.env.API_E2E_BASE_URL ?? 'http://localhost:17006'}/api/link/create/${webhookToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when url is missing', async () => {
    const res = await apiPost(`/api/link/create/${webhookToken}`, {});
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(400);
    expect(body.error).toContain('url');
  });

  it('returns 400 when url is invalid', async () => {
    const res = await apiPost(`/api/link/create/${webhookToken}`, { url: 'not-a-url' });
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(400);
    expect(body.error).toContain('valid URL');
  });

  it('creates a link with an auto-generated slug', async () => {
    const res = await apiPost(`/api/link/create/${webhookToken}`, {
      url: `https://example.com/${testSlug('wh-auto')}`,
    });
    const { status, body } = await jsonResponse<{
      slug: string;
      shortUrl: string;
      originalUrl: string;
    }>(res);

    expect(status).toBe(201);
    expect(body.slug).toBeDefined();
    expect(body.slug.length).toBeGreaterThan(0);
    expect(body.shortUrl).toContain(body.slug);
  });

  it('creates a link with a custom slug', async () => {
    const slug = testSlug('wh-custom');
    const res = await apiPost(`/api/link/create/${webhookToken}`, {
      url: 'https://example.com/custom-test',
      customSlug: slug,
    });
    const { status, body } = await jsonResponse<{
      slug: string;
      shortUrl: string;
      originalUrl: string;
    }>(res);

    expect(status).toBe(201);
    expect(body.slug).toBe(slug);
    expect(body.originalUrl).toBe('https://example.com/custom-test');
  });

  it('returns 409 when custom slug is already taken', async () => {
    const slug = testSlug('wh-taken');
    await seedLink({ slug, originalUrl: 'https://existing.com', userId: TEST_USER_ID });

    const res = await apiPost(`/api/link/create/${webhookToken}`, {
      url: 'https://example.com/conflict',
      customSlug: slug,
    });
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(409);
    expect(body.error).toContain('already taken');
  });

  it('returns 400 when custom slug is invalid', async () => {
    const res = await apiPost(`/api/link/create/${webhookToken}`, {
      url: 'https://example.com',
      customSlug: 'invalid slug with spaces!',
    });

    expect(res.status).toBe(400);
  });

  it('returns existing link (200) when same URL is posted again', async () => {
    const uniqueUrl = `https://example.com/${testSlug('wh-idemp')}`;

    // First call — creates
    const res1 = await apiPost(`/api/link/create/${webhookToken}`, { url: uniqueUrl });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();

    // Second call — returns existing
    const res2 = await apiPost(`/api/link/create/${webhookToken}`, { url: uniqueUrl });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    expect(body2.slug).toBe(body1.slug);
  });

  it('assigns link to folder when folder name matches', async () => {
    const folderId = await seedFolder('WebhookTestFolder', TEST_USER_ID);

    const res = await apiPost(`/api/link/create/${webhookToken}`, {
      url: `https://example.com/${testSlug('wh-folder')}`,
      folder: 'WebhookTestFolder',
    });
    const { status, body } = await jsonResponse<{ slug: string }>(res);

    expect(status).toBe(201);
    expect(body.slug).toBeDefined();

    // Verify folder assignment via lookup (the link exists)
    // We can't directly check folderId via public API, but the link was created
    // successfully with the folder parameter accepted (no error).
    // D1 verification is available if needed:
    const { queryD1 } = await import('./helpers/seed');
    const rows = await queryD1<{ folder_id: string }>(
      'SELECT folder_id FROM links WHERE slug = ?',
      [body.slug],
    );
    expect(unwrap(rows[0]).folder_id).toBe(folderId);
  });

  it('link created via POST appears in GET stats', async () => {
    // Create a dedicated user for clean stats
    const statsUserId = `${TEST_USER_ID}-stats`;
    const { executeD1 } = await import('./helpers/seed');
    await executeD1(
      'INSERT OR IGNORE INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, NULL, NULL)',
      [statsUserId, 'WH Stats User', `${statsUserId}@test.local`],
    );

    // Create a new webhook with its own user to get clean stats
    const { token: freshToken, userId } = await seedWebhook({ userId: statsUserId });

    const res = await apiPost(`/api/link/create/${freshToken}`, {
      url: `https://example.com/${testSlug('wh-stats')}`,
    });
    expect(res.status).toBe(201);

    const getRes = await apiGet(`/api/link/create/${freshToken}`);
    const { body } = await jsonResponse<{ stats: { totalLinks: number } }>(getRes);
    expect(body.stats.totalLinks).toBeGreaterThanOrEqual(1);

    // Clean up the extra user's data
    await executeD1('DELETE FROM links WHERE user_id = ?', [userId]);
    await executeD1('DELETE FROM webhooks WHERE user_id = ?', [userId]);
  });
});
