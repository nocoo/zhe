/**
 * L2 API E2E Tests for GET /api/worker-status
 *
 * Tests the worker status endpoint via real HTTP against a running
 * Next.js dev server. Validates auth guard and response structure.
 */
import { describe, it, expect } from 'vitest';
import { apiGet, apiGetAuth, jsonResponse } from './helpers/http';

describe('GET /api/worker-status', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await apiGet('/api/worker-status');
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns worker health for authenticated requests', async () => {
    const res = await apiGetAuth('/api/worker-status');
    const { status, body } = await jsonResponse<{
      lastSyncTime: string | null;
      kvKeyCount: number | null;
    }>(res);

    expect(status).toBe(200);
    // The response should have the expected shape (values may be null)
    expect(body).toHaveProperty('lastSyncTime');
    expect(body).toHaveProperty('kvKeyCount');
  });
});
