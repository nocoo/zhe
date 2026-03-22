/**
 * L2 API E2E Tests for POST /api/cron/cleanup
 *
 * Tests the tmp cleanup cron endpoint via real HTTP.
 * Validates secret-based auth and basic response structure.
 *
 * Note: The dev server's WORKER_SECRET comes from .env.local.
 * We read the same value to authenticate test requests.
 */
import { describe, it, expect } from 'vitest';
import { apiPost, jsonResponse } from './helpers/http';

// Read WORKER_SECRET from the environment (loaded by run-api-e2e.ts from .env.local)
function getWorkerSecret(): string {
  const secret = process.env.WORKER_SECRET;
  if (!secret) throw new Error('WORKER_SECRET not set in environment');
  return secret;
}

describe('POST /api/cron/cleanup', () => {
  it('rejects request with no secret (401)', async () => {
    const res = await apiPost('/api/cron/cleanup', null);
    expect(res.status).toBe(401);
  });

  it('rejects request with wrong secret (401)', async () => {
    const res = await apiPost('/api/cron/cleanup', null, {
      Authorization: 'Bearer wrong-secret',
    });
    expect(res.status).toBe(401);
  });

  it('accepts secret via Bearer header and returns cleanup stats', async () => {
    const secret = getWorkerSecret();
    const res = await apiPost('/api/cron/cleanup', null, {
      Authorization: `Bearer ${secret}`,
    });
    const { status, body } = await jsonResponse<{
      deleted: number;
      total: number;
      expired?: number;
    }>(res);

    expect(status).toBe(200);
    expect(body).toHaveProperty('deleted');
    expect(body).toHaveProperty('total');
    expect(typeof body.deleted).toBe('number');
    expect(typeof body.total).toBe('number');
  });
});
