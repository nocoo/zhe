/**
 * Unit tests for GET /api/lookup
 *
 * Covers:
 * - Returns 400 when slug query param is missing
 * - Returns 404 when slug does not exist
 * - Returns 200 with link data when slug exists
 * - Returns 404 with expired flag when link is expired
 * - Returns 200 when link has non-expired expiresAt
 * - Returns 500 when DB throws
 * - JSON content type
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearMockStorage } from '../mocks/db-storage';

describe('GET /api/lookup', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('returns 400 when slug param is missing', async () => {
    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest('http://localhost:7005/api/lookup');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Missing slug');
  });

  it('returns 404 when slug does not exist', async () => {
    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest(
      'http://localhost:7005/api/lookup?slug=nonexistent'
    );
    const response = await GET(request);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.found).toBe(false);
  });

  it('returns 200 with link data when slug exists', async () => {
    const { createLink } = await import('@/lib/db');
    const link = await createLink({
      originalUrl: 'https://example.com',
      slug: 'test-lookup',
      userId: 'user-1',
    });

    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest(
      'http://localhost:7005/api/lookup?slug=test-lookup'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.found).toBe(true);
    expect(body.id).toBe(link.id);
    expect(body.originalUrl).toBe('https://example.com');
    expect(body.slug).toBe('test-lookup');
  });

  it('returns 404 with expired flag when link is expired', async () => {
    const { createLink } = await import('@/lib/db');
    await createLink({
      originalUrl: 'https://example.com',
      slug: 'expired-link',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 60_000), // expired 1 min ago
    });

    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest(
      'http://localhost:7005/api/lookup?slug=expired-link'
    );
    const response = await GET(request);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.found).toBe(false);
    expect(body.expired).toBe(true);
  });

  it('returns 200 when link has future expiresAt', async () => {
    const { createLink } = await import('@/lib/db');
    await createLink({
      originalUrl: 'https://example.com',
      slug: 'future-link',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 86_400_000), // expires tomorrow
    });

    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest(
      'http://localhost:7005/api/lookup?slug=future-link'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.found).toBe(true);
    expect(body.slug).toBe('future-link');
  });

  it('returns 500 when getLinkBySlug throws', async () => {
    const db = await import('@/lib/db');
    const spy = vi
      .spyOn(db, 'getLinkBySlug')
      .mockRejectedValue(new Error('DB down'));
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest(
      'http://localhost:7005/api/lookup?slug=any'
    );
    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Lookup failed');

    spy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('returns JSON content type', async () => {
    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest(
      'http://localhost:7005/api/lookup?slug=anything'
    );
    const response = await GET(request);

    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
