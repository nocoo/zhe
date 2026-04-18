/**
 * L2 API E2E Tests for /api/backy/pull
 *
 * Tests the Backy pull webhook endpoint via real HTTP.
 * HEAD (connection test) and POST (trigger backup push).
 *
 * Seeded via D1 HTTP API — no in-process mocks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { apiHead, apiPost, jsonResponse } from './helpers/http';
import { seedTestUser, seedBackyPullKey, cleanupTestData } from './helpers/seed';

const TEST_USER_ID = 'api-backy-test-user';
let pullKey: string;

beforeAll(async () => {
  await cleanupTestData(TEST_USER_ID);
  await seedTestUser(TEST_USER_ID);
  pullKey = await seedBackyPullKey(TEST_USER_ID);
});

afterAll(async () => {
  await cleanupTestData(TEST_USER_ID);
});

// ============================================================
// HEAD — Connection Test
// ============================================================
describe('HEAD /api/backy/pull', () => {
  it('returns 200 for a valid key', async () => {
    const res = await apiHead('/api/backy/pull', { 'x-webhook-key': pullKey });
    expect(res.status).toBe(200);
  });

  it('returns 401 for missing key', async () => {
    const res = await apiHead('/api/backy/pull');
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid key', async () => {
    const res = await apiHead('/api/backy/pull', { 'x-webhook-key': 'bogus-key' });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// POST — Trigger Backup
// ============================================================
describe('POST /api/backy/pull', () => {
  it('returns 401 for missing key', async () => {
    const res = await apiPost('/api/backy/pull', null);
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(401);
    expect(body.error).toContain('Missing');
  });

  it('returns 401 for invalid key', async () => {
    const res = await apiPost('/api/backy/pull', null, {
      'x-webhook-key': 'invalid-key',
    });
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(401);
    expect(body.error).toContain('Invalid');
  });

  it('returns 422 when push config is missing', async () => {
    // Pull key exists but no push config (webhookUrl + apiKey)
    const res = await apiPost('/api/backy/pull', null, {
      'x-webhook-key': pullKey,
    });
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(422);
    expect(body.error).toContain('config');
  });
});
