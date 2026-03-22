/**
 * API E2E Tests — real HTTP
 *
 * Tests the full request → response cycle of API route handlers
 * via real HTTP requests to a running Next.js dev server.
 *
 * Scenarios:
 * 1. GET /api/health — liveness/health check
 * 2. GET /api/lookup — slug resolution
 * 3. POST /api/record-click — click analytics
 * 4. Full redirect flow — lookup → record-click → verify
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { apiGet, apiPostWorker, jsonResponse } from './helpers/http';
import { ensureTestUser, seedLink, cleanupTestData, queryD1, testSlug } from './helpers/seed';

// ---------------------------------------------------------------------------
// Setup: ensure test user exists, clean up before/after
// ---------------------------------------------------------------------------
beforeAll(async () => {
  await ensureTestUser();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

// ============================================================
// Scenario 1: Health Check
// ============================================================
describe('GET /api/health', () => {
  it('returns status ok with version and timestamp', async () => {
    const res = await apiGet('/api/health');
    const { status, body } = await jsonResponse<{ status: string; version: string; timestamp: string }>(res);

    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});

// ============================================================
// Scenario 2: Slug Lookup
// ============================================================
describe('GET /api/lookup', () => {
  it('returns 400 when slug parameter is missing', async () => {
    const res = await apiGet('/api/lookup');
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(400);
    expect(body.error).toBe('Missing slug');
  });

  it('returns 404 when slug does not exist', async () => {
    const res = await apiGet('/api/lookup?slug=nonexistent-never-exists');
    const { status, body } = await jsonResponse<{ found: boolean }>(res);

    expect(status).toBe(404);
    expect(body.found).toBe(false);
  });

  it('returns the link when slug exists', async () => {
    const slug = testSlug('lookup');
    await seedLink({ slug, originalUrl: 'https://github.com' });

    const res = await apiGet(`/api/lookup?slug=${slug}`);
    const { status, body } = await jsonResponse<{ found: boolean; originalUrl: string; slug: string; expiresAt: string | null }>(res);

    expect(status).toBe(200);
    expect(body.found).toBe(true);
    expect(body.originalUrl).toBe('https://github.com');
    expect(body.slug).toBe(slug);
    expect(body.expiresAt).toBeNull();
  });

  it('returns 404 for an expired link', async () => {
    const slug = testSlug('expired');
    await seedLink({
      slug,
      originalUrl: 'https://expired.example.com',
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(), // expired yesterday
    });

    const res = await apiGet(`/api/lookup?slug=${slug}`);
    const { status, body } = await jsonResponse<{ found: boolean; expired: boolean }>(res);

    expect(status).toBe(404);
    expect(body.found).toBe(false);
    expect(body.expired).toBe(true);
  });
});

// ============================================================
// Scenario 3: Record Click
// ============================================================
describe('POST /api/record-click', () => {
  it('returns 400 when linkId is missing', async () => {
    const res = await apiPostWorker('/api/record-click', {});
    const { status, body } = await jsonResponse<{ error: string }>(res);

    expect(status).toBe(400);
    expect(body.error).toContain('linkId');
  });

  it('returns 400 when linkId is not a number', async () => {
    const res = await apiPostWorker('/api/record-click', { linkId: 'abc' });

    expect(res.status).toBe(400);
  });

  it('records a click successfully with full metadata', async () => {
    const { id: linkId, slug } = await seedLink({ slug: testSlug('click-full') });

    const res = await apiPostWorker('/api/record-click', {
      linkId,
      device: 'desktop',
      browser: 'Chrome',
      os: 'macOS',
      country: 'US',
      city: 'San Francisco',
      referer: 'https://twitter.com',
    });
    const { status, body } = await jsonResponse<{ success: boolean }>(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    // Verify click count via D1 query (black-box: check DB side effect)
    const rows = await queryD1<{ clicks: number }>('SELECT clicks FROM links WHERE slug = ?', [slug]);
    expect(rows[0].clicks).toBe(1);
  });

  it('records a click with minimal metadata', async () => {
    const { id: linkId } = await seedLink({ slug: testSlug('click-min') });

    const res = await apiPostWorker('/api/record-click', { linkId });
    const { status, body } = await jsonResponse<{ success: boolean }>(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ============================================================
// Scenario 4: Full Redirect Flow (lookup → record-click → verify)
// ============================================================
describe('Redirect flow (lookup → analytics)', () => {
  let flowSlug: string;
  let flowLinkId: number;

  beforeEach(async () => {
    flowSlug = testSlug('flow');
    const seeded = await seedLink({ slug: flowSlug, originalUrl: 'https://example.com/target' });
    flowLinkId = seeded.id;
  });

  it('complete flow: seed link → lookup → record click → verify analytics', async () => {
    // Step 1: Lookup the slug
    const lookupRes = await apiGet(`/api/lookup?slug=${flowSlug}`);
    const { body: lookupBody } = await jsonResponse<{ found: boolean; originalUrl: string; id: number }>(lookupRes);

    expect(lookupRes.status).toBe(200);
    expect(lookupBody.found).toBe(true);
    expect(lookupBody.originalUrl).toBe('https://example.com/target');

    // Step 2: Record a click
    const clickRes = await apiPostWorker('/api/record-click', {
      linkId: lookupBody.id,
      device: 'mobile',
      browser: 'Safari',
      os: 'iOS',
      country: 'JP',
      city: 'Tokyo',
      referer: null,
    });
    expect(clickRes.status).toBe(200);

    // Step 3: Verify click count incremented
    const rows = await queryD1<{ clicks: number }>('SELECT clicks FROM links WHERE slug = ?', [flowSlug]);
    expect(rows[0].clicks).toBe(1);
  });

  it('multiple clicks increment counter correctly', async () => {
    // Record 3 clicks
    for (let i = 0; i < 3; i++) {
      const res = await apiPostWorker('/api/record-click', {
        linkId: flowLinkId,
        device: i % 2 === 0 ? 'desktop' : 'mobile',
        browser: 'Chrome',
        os: 'Windows',
        country: 'US',
      });
      expect(res.status).toBe(200);
    }

    // Verify
    const rows = await queryD1<{ clicks: number }>('SELECT clicks FROM links WHERE slug = ?', [flowSlug]);
    expect(rows[0].clicks).toBe(3);
  });
});
