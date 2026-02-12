/**
 * Unit tests for GET /api/live
 *
 * Covers:
 * - Happy path: DB healthy → 200, status "ok", metadata fields
 * - DB credentials missing → 503, status "error"
 * - DB query failure → 503, status "error", sanitised message
 * - Cache-Control header is no-store
 * - Error responses never contain the word "ok" (monitor keyword safety)
 * - Response includes version, timestamp, dependencies
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Keep a handle so we can restore per-test overrides
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  // Ensure D1 env vars are set by default (mock setup provides the mock)
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
  process.env.CLOUDFLARE_D1_DATABASE_ID = 'test-db';
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe('GET /api/live', () => {
  // ---- Happy path ----

  it('returns 200 with status "ok" when database is healthy', async () => {
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

  it('includes version field', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.version).toBeDefined();
    expect(typeof body.version).toBe('string');
  });

  it('uses npm_package_version env var when available', async () => {
    vi.resetModules();
    process.env.npm_package_version = '1.2.3';

    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.version).toBe('1.2.3');
  });

  it('falls back to 0.1.0 when npm_package_version is unset', async () => {
    vi.resetModules();
    delete process.env.npm_package_version;

    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.version).toBe('0.1.0');
  });

  it('does not include uptime (unavailable in Edge Runtime)', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.uptime).toBeUndefined();
  });

  it('includes database dependency with connected=true and latencyMs', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.dependencies).toBeDefined();
    expect(body.dependencies.database.connected).toBe(true);
    expect(typeof body.dependencies.database.latencyMs).toBe('number');
    expect(body.dependencies.database.error).toBeUndefined();
  });

  it('does not include "message" field when healthy', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.message).toBeUndefined();
  });

  // ---- Cache control ----

  it('sets Cache-Control: no-store header', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    const cc = response.headers.get('Cache-Control');
    expect(cc).toContain('no-store');
    expect(cc).toContain('no-cache');
  });

  // ---- DB credentials missing ----

  it('returns 503 with status "error" when D1 credentials are missing', async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_D1_DATABASE_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;

    // Re-import to pick up env changes — the mock's isD1Configured reads env at call time
    vi.resetModules();
    // Override mock to return false for isD1Configured
    vi.doMock('@/lib/db/d1-client', () => ({
      isD1Configured: () => false,
      executeD1Query: vi.fn(),
    }));

    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.dependencies.database.connected).toBe(false);
    expect(body.dependencies.database.error).toContain('not configured');
    expect(body.message).toBeDefined();
  });

  // ---- DB query failure ----

  it('returns 503 with status "error" when D1 query throws', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/d1-client', () => ({
      isD1Configured: () => true,
      executeD1Query: vi.fn().mockRejectedValue(new Error('connection timeout')),
    }));

    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.dependencies.database.connected).toBe(false);
    expect(body.dependencies.database.error).toContain('connection timeout');
  });

  it('returns 503 when D1 throws a non-Error object', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/d1-client', () => ({
      isD1Configured: () => true,
      executeD1Query: vi.fn().mockRejectedValue('string error'),
    }));

    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.dependencies.database.error).toBe('unexpected database failure');
  });

  // ---- Keyword safety: error responses must never contain "ok" ----

  it('error response body never contains the word "ok" in any value', async () => {
    vi.resetModules();
    // Simulate an error message that coincidentally contains "ok"
    vi.doMock('@/lib/db/d1-client', () => ({
      isD1Configured: () => true,
      executeD1Query: vi.fn().mockRejectedValue(new Error('token revoked')),
    }));

    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body.status).toBe('error');

    // Ensure the word "ok" does not appear anywhere in the serialised error body
    // (status is "error" so we only scan dependency details + message)
    const errorJson = JSON.stringify({
      message: body.message,
      dependencies: body.dependencies,
    });
    // Match standalone "ok" (case-insensitive) — we replaced it with **
    expect(errorJson.toLowerCase()).not.toContain('"ok"');
    // Also check that the status itself is not "ok"
    expect(body.status).not.toBe('ok');
  });

  it('sanitises "ok" from D1 error messages containing "ok"', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/d1-client', () => ({
      isD1Configured: () => true,
      executeD1Query: vi.fn().mockRejectedValue(new Error('lookup failed ok')),
    }));

    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    // The word "ok" should have been replaced
    expect(body.dependencies.database.error).not.toContain('ok');
    expect(body.dependencies.database.error).not.toContain('OK');
  });

  // ---- Response shape consistency ----

  it('always returns JSON content type', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('response body has all required top-level keys', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('dependencies');
  });
});
