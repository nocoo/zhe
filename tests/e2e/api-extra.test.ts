/**
 * E2E API Error Path Tests
 *
 * Tests the error-handling catch blocks of API route handlers
 * by mocking @/lib/db to throw errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  getLinkBySlug: vi.fn(),
  recordClick: vi.fn(),
}));

describe('GET /api/lookup — error path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 when getLinkBySlug throws', async () => {
    const { getLinkBySlug } = await import('@/lib/db');
    (getLinkBySlug as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('D1 connection failed'),
    );

    const { GET } = await import('@/app/api/lookup/route');
    const request = new NextRequest('http://localhost:7005/api/lookup?slug=boom');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Lookup failed');
  });
});

describe('POST /api/record-click — error path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INTERNAL_API_SECRET;
  });

  it('returns 500 when recordClick throws', async () => {
    const { recordClick } = await import('@/lib/db');
    (recordClick as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('D1 write failed'),
    );

    const { POST } = await import('@/app/api/record-click/route');
    const request = new NextRequest('http://localhost:7005/api/record-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId: 42 }),
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to record click');
  });

  it('returns 403 when internal secret does not match', async () => {
    process.env.INTERNAL_API_SECRET = 'real-secret';

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
    const body = await response.json();
    expect(body.error).toBe('Forbidden');
  });
});
