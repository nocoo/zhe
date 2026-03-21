/**
 * API E2E Tests for GET /api/live
 *
 * Tests the liveness probe endpoint via real HTTP requests.
 * Validates status code, response body, and cache headers
 * from the perspective of an external monitoring service.
 */
import { describe, it, expect } from 'vitest';
import { apiGet, jsonResponse } from './helpers/http';

describe('GET /api/live', () => {
  it('returns 200 with ok status, version, and ISO timestamp', async () => {
    const res = await apiGet('/api/live');
    const { status, body } = await jsonResponse<{ status: string; version: string; timestamp: string }>(res);

    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    // Timestamp is valid ISO-8601
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('sets no-cache headers for monitoring accuracy', async () => {
    const res = await apiGet('/api/live');

    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('no-store');
    expect(cc).toContain('no-cache');
  });

  it('returns exactly status, timestamp, version keys (no extra fields)', async () => {
    const res = await apiGet('/api/live');
    const { body } = await jsonResponse<Record<string, unknown>>(res);

    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp', 'version']);
  });
});
