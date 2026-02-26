/**
 * Unit tests for GET /api/live
 *
 * Covers:
 * - Always returns 200 with status "ok"
 * - Includes version from APP_VERSION
 * - Includes valid ISO-8601 timestamp
 * - Cache-Control header is no-store
 * - No dependencies or message fields
 * - JSON content type
 */
import { describe, it, expect } from 'vitest';
import { APP_VERSION } from '@/lib/version';

describe('GET /api/live', () => {
  it('returns 200 with status "ok"', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('includes timestamp as valid ISO-8601 string', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('includes version from APP_VERSION', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.version).toBe(APP_VERSION);
  });

  it('does not include dependencies field', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.dependencies).toBeUndefined();
  });

  it('does not include message field', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.message).toBeUndefined();
  });

  it('sets Cache-Control: no-store header', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    const cc = response.headers.get('Cache-Control');
    expect(cc).toContain('no-store');
    expect(cc).toContain('no-cache');
  });

  it('returns JSON content type', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('response body has exactly status, timestamp, version keys', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp', 'version']);
  });
});
