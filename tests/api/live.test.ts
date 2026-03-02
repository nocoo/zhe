/**
 * API E2E Tests for GET /api/live
 *
 * Tests the liveness probe endpoint from the perspective of an
 * external monitoring service. Validates the full request → response
 * cycle with real route handlers.
 */
import { describe, it, expect } from 'vitest';
import { APP_VERSION } from '@/lib/version';

describe('GET /api/live', () => {
  it('returns 200 with ok status, version, and ISO timestamp', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe(APP_VERSION);
    // Timestamp is valid ISO-8601
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('sets no-cache headers for monitoring accuracy', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    const cc = response.headers.get('Cache-Control');
    expect(cc).toContain('no-store');
    expect(cc).toContain('no-cache');
  });

  it('returns exactly status, timestamp, version keys (no extra fields)', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp', 'version']);
  });
});
