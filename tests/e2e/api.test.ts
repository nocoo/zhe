/**
 * E2E API Tests
 *
 * Tests the full request → response cycle of API route handlers.
 * Uses real NextRequest/NextResponse objects with the in-memory D1 mock.
 * Validates HTTP status codes, response bodies, and error handling
 * from the perspective of an external HTTP client (BDD style).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearMockStorage } from '../setup';

// Seed a link into mock storage before tests
async function seedLink(slug: string, originalUrl: string, userId = 'user-e2e') {
  const { createLink } = await import('@/lib/db');
  return createLink({
    userId,
    folderId: null,
    originalUrl,
    slug,
    isCustom: true,
    clicks: 0,
    expiresAt: null,
  });
}

async function seedExpiredLink(slug: string, originalUrl: string, userId = 'user-e2e') {
  const { createLink } = await import('@/lib/db');
  return createLink({
    userId,
    folderId: null,
    originalUrl,
    slug,
    isCustom: true,
    clicks: 0,
    expiresAt: new Date(Date.now() - 86_400_000), // expired yesterday
  });
}

// ============================================================
// Scenario 1: Health Check
// As an external monitor, I want to hit GET /api/health
// so I can verify the service is up.
// ============================================================
describe('GET /api/health', () => {
  it('returns status ok with version and timestamp', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.2.1');
    expect(body.timestamp).toBeDefined();
    // Verify timestamp is a valid ISO string
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});

// ============================================================
// Scenario 2: Slug Lookup
// As the middleware, I want to query GET /api/lookup?slug=xxx
// so I can decide whether to redirect the user.
// ============================================================
describe('GET /api/lookup', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('returns 400 when slug parameter is missing', async () => {
    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest('http://localhost:7005/api/lookup');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Missing slug');
  });

  it('returns 404 when slug does not exist', async () => {
    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest('http://localhost:7005/api/lookup?slug=nonexistent');
    const response = await GET(request);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.found).toBe(false);
  });

  it('returns the link when slug exists', async () => {
    const link = await seedLink('gh', 'https://github.com');

    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest('http://localhost:7005/api/lookup?slug=gh');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.found).toBe(true);
    expect(body.id).toBe(link.id);
    expect(body.originalUrl).toBe('https://github.com');
    expect(body.slug).toBe('gh');
  });

  it('returns 404 for an expired link', async () => {
    await seedExpiredLink('old', 'https://expired.example.com');

    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest('http://localhost:7005/api/lookup?slug=old');
    const response = await GET(request);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.found).toBe(false);
    expect(body.expired).toBe(true);
  });
});

// ============================================================
// Scenario 3: Record Click
// As the middleware, I want to POST /api/record-click
// so analytics are persisted after a redirect.
// ============================================================
describe('POST /api/record-click', () => {
  beforeEach(() => {
    clearMockStorage();
    // Clear env var between tests
    delete process.env.INTERNAL_API_SECRET;
  });

  it('returns 400 when linkId is missing', async () => {
    const { POST } = await import('@/app/api/record-click/route');
    const request = new NextRequest('http://localhost:7005/api/record-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('linkId');
  });

  it('returns 400 when linkId is not a number', async () => {
    const { POST } = await import('@/app/api/record-click/route');
    const request = new NextRequest('http://localhost:7005/api/record-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId: 'abc' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('records a click successfully with full metadata', async () => {
    const link = await seedLink('test-click', 'https://example.com');

    const { POST } = await import('@/app/api/record-click/route');
    const request = new NextRequest('http://localhost:7005/api/record-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        linkId: link.id,
        device: 'desktop',
        browser: 'Chrome',
        os: 'macOS',
        country: 'US',
        city: 'San Francisco',
        referer: 'https://twitter.com',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify analytics were actually recorded
    const { getAnalyticsByLinkId } = await import('@/lib/db');
    const analytics = await getAnalyticsByLinkId(link.id);
    expect(analytics).toHaveLength(1);
    expect(analytics[0].country).toBe('US');
    expect(analytics[0].browser).toBe('Chrome');
    expect(analytics[0].device).toBe('desktop');
  });

  it('records a click with minimal metadata (nulls)', async () => {
    const link = await seedLink('minimal', 'https://example.com');

    const { POST } = await import('@/app/api/record-click/route');
    const request = new NextRequest('http://localhost:7005/api/record-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId: link.id }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  // Shared-secret protection tests
  describe('with INTERNAL_API_SECRET set', () => {
    beforeEach(() => {
      process.env.INTERNAL_API_SECRET = 'test-secret-123';
    });

    it('returns 403 when secret header is missing', async () => {
      const { POST } = await import('@/app/api/record-click/route');
      const request = new NextRequest('http://localhost:7005/api/record-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId: 1 }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Forbidden');
    });

    it('returns 403 when secret header is wrong', async () => {
      const { POST } = await import('@/app/api/record-click/route');
      const request = new NextRequest('http://localhost:7005/api/record-click', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'wrong-secret',
        },
        body: JSON.stringify({ linkId: 1 }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
    });

    it('succeeds when correct secret header is provided', async () => {
      // Seed a link first
      const link = await seedLink('secret-test', 'https://example.com');

      const { POST } = await import('@/app/api/record-click/route');
      const request = new NextRequest('http://localhost:7005/api/record-click', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'test-secret-123',
        },
        body: JSON.stringify({ linkId: link.id }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });
});

// ============================================================
// Scenario 4: Full Redirect Flow (integration)
// As a user clicking a short link, the middleware should:
// 1. Lookup the slug via /api/lookup
// 2. Get the original URL
// 3. Respond with 307 redirect
// This tests the data flow end-to-end without a running server.
// ============================================================
describe('Redirect flow (lookup → analytics)', () => {
  beforeEach(() => {
    delete process.env.INTERNAL_API_SECRET;
    clearMockStorage();
  });

  it('complete flow: seed link → lookup → record click → verify analytics', async () => {
    // Step 1: Seed a link
    const link = await seedLink('flow', 'https://example.com/target');

    // Step 2: Lookup the slug (simulates what middleware does)
    const { GET } = await import('@/app/api/lookup/route');
    const lookupReq = new NextRequest('http://localhost:7005/api/lookup?slug=flow');
    const lookupRes = await GET(lookupReq);
    const lookupBody = await lookupRes.json();

    expect(lookupRes.status).toBe(200);
    expect(lookupBody.found).toBe(true);
    expect(lookupBody.originalUrl).toBe('https://example.com/target');

    // Step 3: Record a click (simulates middleware's waitUntil)
    const { POST } = await import('@/app/api/record-click/route');
    const clickReq = new NextRequest('http://localhost:7005/api/record-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        linkId: lookupBody.id,
        device: 'mobile',
        browser: 'Safari',
        os: 'iOS',
        country: 'JP',
        city: 'Tokyo',
        referer: null,
      }),
    });
    const clickRes = await POST(clickReq);
    expect(clickRes.status).toBe(200);

    // Step 4: Verify analytics are recorded
    const { getAnalyticsByLinkId, getLinkBySlug } = await import('@/lib/db');
    const analytics = await getAnalyticsByLinkId(link.id);
    expect(analytics).toHaveLength(1);
    expect(analytics[0].country).toBe('JP');
    expect(analytics[0].device).toBe('mobile');

    // Step 5: Verify click count was incremented
    const updatedLink = await getLinkBySlug('flow');
    expect(updatedLink).not.toBeNull();
    expect(updatedLink!.clicks).toBe(1);
  });

  it('multiple clicks increment counter correctly', async () => {
    const link = await seedLink('multi', 'https://example.com/multi');

    const { POST } = await import('@/app/api/record-click/route');

    // Record 3 clicks
    for (let i = 0; i < 3; i++) {
      const req = new NextRequest('http://localhost:7005/api/record-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkId: link.id,
          device: i % 2 === 0 ? 'desktop' : 'mobile',
          browser: 'Chrome',
          os: 'Windows',
          country: 'US',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    }

    // Verify
    const { getAnalyticsByLinkId, getLinkBySlug } = await import('@/lib/db');
    const analytics = await getAnalyticsByLinkId(link.id);
    expect(analytics).toHaveLength(3);

    const updatedLink = await getLinkBySlug('multi');
    expect(updatedLink!.clicks).toBe(3);
  });
});
