/**
 * L2 API E2E Tests for /api/link/create/[token]
 *
 * Tests the webhook link creation API via real HTTP.
 * HEAD (connection test), GET (status/docs), POST (link creation).
 *
 * Seeded via D1 HTTP API — no in-process mocks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { apiGet, apiHead, jsonResponse } from './helpers/http';
import { seedWebhook, cleanupTestData, resetAndSeedUser } from './helpers/seed';
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
