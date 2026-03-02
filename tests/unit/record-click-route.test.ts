/**
 * Unit tests for POST /api/record-click
 *
 * Covers:
 * - Returns 200 with success when valid click data is sent
 * - Records analytics in the database
 * - Returns 400 when linkId is missing
 * - Returns 400 when linkId is not a number
 * - Returns 403 when WORKER_SECRET is set but token is wrong
 * - Returns 403 when WORKER_SECRET is set but Authorization header is missing
 * - Allows request when WORKER_SECRET is set and token matches
 * - Allows request when WORKER_SECRET is not set (no auth required)
 * - Handles null optional fields gracefully
 * - Returns 500 when recordClick throws
 * - JSON content type
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearMockStorage } from '../mocks/db-storage';

function makeRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest('http://localhost:7005/api/record-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/record-click', () => {
  beforeEach(() => {
    clearMockStorage();
    delete process.env.WORKER_SECRET;
  });

  afterEach(() => {
    delete process.env.WORKER_SECRET;
  });

  it('returns 200 with success when valid click data is sent', async () => {
    // Seed a link first so the linkId is valid
    const { createLink } = await import('@/lib/db');
    const link = await createLink({
      originalUrl: 'https://example.com',
      slug: 'click-test',
      userId: 'user-1',
    });

    const { POST } = await import('@/app/api/record-click/route');
    const request = makeRequest({
      linkId: link.id,
      device: 'desktop',
      browser: 'Chrome',
      os: 'macOS',
      country: 'US',
      city: 'San Francisco',
      referer: 'https://twitter.com',
      source: 'worker',
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('records analytics in the database', async () => {
    const { createLink, getAnalyticsByLinkId } = await import('@/lib/db');
    const link = await createLink({
      originalUrl: 'https://example.com',
      slug: 'analytics-test',
      userId: 'user-1',
    });

    const { POST } = await import('@/app/api/record-click/route');
    const request = makeRequest({
      linkId: link.id,
      device: 'mobile',
      browser: 'Safari',
      os: 'iOS',
      country: 'JP',
      city: 'Tokyo',
      referer: null,
      source: 'worker',
    });
    await POST(request);

    const analytics = await getAnalyticsByLinkId(link.id);
    expect(analytics).toHaveLength(1);
    expect(analytics[0].device).toBe('mobile');
    expect(analytics[0].country).toBe('JP');
  });

  it('returns 400 when linkId is missing', async () => {
    const { POST } = await import('@/app/api/record-click/route');
    const request = makeRequest({ device: 'desktop' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('linkId');
  });

  it('returns 400 when linkId is not a number', async () => {
    const { POST } = await import('@/app/api/record-click/route');
    const request = makeRequest({ linkId: 'not-a-number' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('linkId');
  });

  describe('with WORKER_SECRET set', () => {
    beforeEach(() => {
      process.env.WORKER_SECRET = 'test-secret-123';
    });

    it('returns 403 when token does not match', async () => {
      const { POST } = await import('@/app/api/record-click/route');
      const request = makeRequest(
        { linkId: 1 },
        { Authorization: 'Bearer wrong-token' }
      );
      const response = await POST(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Forbidden');
    });

    it('returns 403 when Authorization header is missing', async () => {
      const { POST } = await import('@/app/api/record-click/route');
      const request = makeRequest({ linkId: 1 });
      const response = await POST(request);

      expect(response.status).toBe(403);
    });

    it('allows request when token matches', async () => {
      const { createLink } = await import('@/lib/db');
      const link = await createLink({
        originalUrl: 'https://example.com',
        slug: 'auth-test',
        userId: 'user-1',
      });

      const { POST } = await import('@/app/api/record-click/route');
      const request = makeRequest(
        { linkId: link.id, source: 'worker' },
        { Authorization: 'Bearer test-secret-123' }
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  it('allows request when WORKER_SECRET is not set', async () => {
    const { createLink } = await import('@/lib/db');
    const link = await createLink({
      originalUrl: 'https://example.com',
      slug: 'no-secret',
      userId: 'user-1',
    });

    const { POST } = await import('@/app/api/record-click/route');
    const request = makeRequest({ linkId: link.id });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('handles null optional fields gracefully', async () => {
    const { createLink } = await import('@/lib/db');
    const link = await createLink({
      originalUrl: 'https://example.com',
      slug: 'null-fields',
      userId: 'user-1',
    });

    const { POST } = await import('@/app/api/record-click/route');
    const request = makeRequest({ linkId: link.id });
    const response = await POST(request);

    expect(response.status).toBe(200);

    const { getAnalyticsByLinkId } = await import('@/lib/db');
    const analytics = await getAnalyticsByLinkId(link.id);
    expect(analytics).toHaveLength(1);
    expect(analytics[0].device).toBeNull();
    expect(analytics[0].browser).toBeNull();
    expect(analytics[0].country).toBeNull();
  });

  it('returns 500 when recordClick throws', async () => {
    const db = await import('@/lib/db');
    const spy = vi
      .spyOn(db, 'recordClick')
      .mockRejectedValue(new Error('DB down'));
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { POST } = await import('@/app/api/record-click/route');
    const request = makeRequest({ linkId: 1 });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to record click');

    spy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('returns JSON content type', async () => {
    const { createLink } = await import('@/lib/db');
    const link = await createLink({
      originalUrl: 'https://example.com',
      slug: 'content-type-test',
      userId: 'user-1',
    });

    const { POST } = await import('@/app/api/record-click/route');
    const request = makeRequest({ linkId: link.id });
    const response = await POST(request);

    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
