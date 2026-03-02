/**
 * Unit tests for GET /api/health
 *
 * Covers:
 * - Returns 200 with status "ok"
 * - Includes version from APP_VERSION
 * - Includes valid ISO-8601 timestamp
 * - Response body has exactly status, timestamp, version keys
 * - JSON content type
 */
import { describe, it, expect } from 'vitest';
import { APP_VERSION } from '@/lib/version';

describe('GET /api/health', () => {
  it('returns 200 with status "ok"', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('includes valid ISO-8601 timestamp', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('includes version from APP_VERSION', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(body.version).toBe(APP_VERSION);
  });

  it('response body has exactly status, timestamp, version keys', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp', 'version']);
  });

  it('returns JSON content type', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();

    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
