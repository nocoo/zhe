/**
 * L2 API E2E Tests for POST /api/cron/sync-kv
 *
 * Tests the KV sync endpoint via real HTTP.
 * Validates secret-based auth and response structure.
 *
 * Note: If KV is not configured on the test environment, the endpoint
 * returns 503, which is a valid response that we test for.
 */
import { describe, it, expect } from 'vitest';
import { apiPost, jsonResponse } from './helpers/http';

function getWorkerSecret(): string {
  const secret = process.env.WORKER_SECRET;
  if (!secret) throw new Error('WORKER_SECRET not set in environment');
  return secret;
}

describe('POST /api/cron/sync-kv', () => {
  it('rejects request with no secret (401)', async () => {
    const res = await apiPost('/api/cron/sync-kv', null);
    expect(res.status).toBe(401);
  });

  it('rejects request with wrong secret (401)', async () => {
    const res = await apiPost('/api/cron/sync-kv', null, {
      Authorization: 'Bearer wrong-secret',
    });
    expect(res.status).toBe(401);
  });

  it('accepts secret via Bearer header and returns sync result or 503', async () => {
    const secret = getWorkerSecret();
    const res = await apiPost('/api/cron/sync-kv', null, {
      Authorization: `Bearer ${secret}`,
    });

    // 200 = sync completed (with or without skipped), 503 = KV not configured
    expect([200, 503]).toContain(res.status);

    if (res.status === 200) {
      const { body } = await jsonResponse<{
        synced?: number;
        failed?: number;
        total?: number;
        durationMs?: number;
        skipped?: boolean;
        message?: string;
      }>(res);

      if (body.skipped) {
        expect(body.message).toBe('No mutations since last sync');
      } else {
        expect(body).toHaveProperty('synced');
        expect(body).toHaveProperty('total');
        expect(typeof body.synced).toBe('number');
      }
    } else {
      const { body } = await jsonResponse<{ error: string }>(res);
      expect(body.error).toContain('KV not configured');
    }
  });

});
