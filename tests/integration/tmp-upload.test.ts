/**
 * API Tests for /api/tmp/upload/[token]
 *
 * Tests the tmp upload endpoint: POST (file upload), GET (info/docs),
 * HEAD (connection test). Uses the in-memory D1 mock for webhook token lookup.
 * Each test uses a unique token to avoid rate-limiter cross-test pollution.
 *
 * POST tests use a stub Request with mocked formData() because jsdom's
 * FormData implementation doesn't support request.formData() properly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearMockStorage } from '../setup';
import { getMockWebhooks } from '../mocks/db-storage';
import type { Webhook } from '@/lib/db/schema';

const BASE = 'http://localhost:7005';

// Unique token counter
let tokenSeq = 0;
function uniqueToken(): string {
  return `tmp-tok-${++tokenSeq}-${Date.now()}`;
}

/** Seed a webhook directly into mock storage. */
function seedWebhook(
  userId = 'tmp-upload-user',
  rateLimit = 10,
): { userId: string; token: string } {
  const token = uniqueToken();
  const mockWebhooks = getMockWebhooks();
  mockWebhooks.set(userId, {
    id: mockWebhooks.size + 1,
    user_id: userId,
    token,
    rate_limit: rateLimit,
    created_at: Date.now(),
  } as unknown as Webhook);
  return { userId, token };
}

// Mock R2 upload
const mockUploadBufferToR2 = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/r2/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2/client')>();
  return {
    ...actual,
    uploadBufferToR2: (...args: unknown[]) => mockUploadBufferToR2(...args),
  };
});

/**
 * Build a Request with a mocked formData() that returns a FormData-like
 * object. This works around jsdom's broken request.formData().
 */
function makeUploadRequest(
  token: string,
  file?: { name: string; type?: string; content: string | Uint8Array } | null,
  fieldName = 'file',
): Request {
  const url = `${BASE}/api/tmp/upload/${token}`;
  const req = new Request(url, { method: 'POST' });

  // Override formData() to return our mock data
  const mockFormData = new Map<string, unknown>();
  if (file) {
    const content = typeof file.content === 'string'
      ? new TextEncoder().encode(file.content)
      : file.content;
    // Build a File-like object with a working arrayBuffer() since jsdom's
    // File constructor doesn't support it reliably.
    const fileLike = {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: content.byteLength,
      arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
    };
    // Ensure instanceof File check passes by using Object.create
    Object.setPrototypeOf(fileLike, File.prototype);
    mockFormData.set(fieldName, fileLike);
  } else if (file === null) {
    // No file at all — add a non-file field
    mockFormData.set(fieldName, 'not-a-file');
  }

  req.formData = async () => {
    const fd = {
      get: (name: string) => mockFormData.get(name) ?? null,
      has: (name: string) => mockFormData.has(name),
    } as unknown as FormData;
    return fd;
  };

  return req;
}

/**
 * Build a Request whose formData() throws (simulates non-multipart body).
 */
function makeBadFormDataRequest(token: string): Request {
  const url = `${BASE}/api/tmp/upload/${token}`;
  const req = new Request(url, { method: 'POST' });
  req.formData = async () => { throw new Error('not multipart'); };
  return req;
}

// ============================================================
// HEAD — Connection Test
// ============================================================
describe('HEAD /api/tmp/upload/[token]', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('returns 200 for a valid token', async () => {
    const { token } = seedWebhook();

    const { HEAD } = await import('@/app/api/tmp/upload/[token]/route');
    const res = await HEAD(
      new Request(`${BASE}/api/tmp/upload/${token}`, { method: 'HEAD' }),
      { params: Promise.resolve({ token }) },
    );

    expect(res.status).toBe(200);
  });

  it('returns 404 for an invalid token', async () => {
    const { HEAD } = await import('@/app/api/tmp/upload/[token]/route');
    const res = await HEAD(
      new Request(`${BASE}/api/tmp/upload/bad-token`, { method: 'HEAD' }),
      { params: Promise.resolve({ token: 'bad-token' }) },
    );

    expect(res.status).toBe(404);
  });
});

// ============================================================
// GET — Info & Docs
// ============================================================
describe('GET /api/tmp/upload/[token]', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('returns endpoint info for a valid token', async () => {
    const { token } = seedWebhook();

    const { GET } = await import('@/app/api/tmp/upload/[token]/route');
    const res = await GET(
      new NextRequest(`${BASE}/api/tmp/upload/${token}`),
      { params: Promise.resolve({ token }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('active');
    expect(body.description).toContain('Temporary file upload');
    expect(body.maxFileSize).toBe('10 MB');
    expect(body.usage.method).toBe('POST');
    expect(body.usage.field).toBe('file');
    expect(body.usage.example).toContain(token);
  });

  it('returns 404 for an invalid token', async () => {
    const { GET } = await import('@/app/api/tmp/upload/[token]/route');
    const res = await GET(
      new NextRequest(`${BASE}/api/tmp/upload/bad-token`),
      { params: Promise.resolve({ token: 'bad-token' }) },
    );

    expect(res.status).toBe(404);
  });
});

// ============================================================
// POST — File Upload
// ============================================================
describe('POST /api/tmp/upload/[token]', () => {
  beforeEach(() => {
    clearMockStorage();
    mockUploadBufferToR2.mockReset().mockResolvedValue(undefined);
    process.env.R2_PUBLIC_DOMAIN = 'https://s.zhe.to';
  });

  it('uploads a file and returns key, url, size, contentType', async () => {
    const { token } = seedWebhook();

    const { POST } = await import('@/app/api/tmp/upload/[token]/route');
    const req = makeUploadRequest(token, { name: 'test.txt', type: 'text/plain', content: 'hello world' });
    const res = await POST(req, { params: Promise.resolve({ token }) });

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.key).toMatch(/^tmp\/[0-9a-f-]+_\d+\.txt$/);
    expect(body.url).toBe(`https://s.zhe.to/${body.key}`);
    expect(body.size).toBe(11); // 'hello world'.length
    expect(body.contentType).toBe('text/plain');

    expect(mockUploadBufferToR2).toHaveBeenCalledOnce();
    expect(mockUploadBufferToR2.mock.calls[0][0]).toBe(body.key);
    expect(mockUploadBufferToR2.mock.calls[0][2]).toBe('text/plain');
  });

  it('returns 404 for an invalid token', async () => {
    const { POST } = await import('@/app/api/tmp/upload/[token]/route');
    const req = makeUploadRequest('bad-token', { name: 'file.zip', content: 'data' });
    const res = await POST(req, { params: Promise.resolve({ token: 'bad-token' }) });

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid multipart form data', async () => {
    const { token } = seedWebhook();

    const { POST } = await import('@/app/api/tmp/upload/[token]/route');
    const req = makeBadFormDataRequest(token);
    const res = await POST(req, { params: Promise.resolve({ token }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid multipart');
  });

  it('returns 400 when file field is missing', async () => {
    const { token } = seedWebhook();

    const { POST } = await import('@/app/api/tmp/upload/[token]/route');
    // Send a form with a different field name
    const req = makeUploadRequest(token, { name: 'file.txt', content: 'data' }, 'notfile');
    const res = await POST(req, { params: Promise.resolve({ token }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('file');
  });

  it('returns 400 for empty file', async () => {
    const { token } = seedWebhook();

    const { POST } = await import('@/app/api/tmp/upload/[token]/route');
    const req = makeUploadRequest(token, { name: 'empty.txt', type: 'text/plain', content: '' });
    const res = await POST(req, { params: Promise.resolve({ token }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('empty');
  });

  it('returns 413 for file exceeding max size', async () => {
    const { token } = seedWebhook();

    const bigContent = new Uint8Array(10 * 1024 * 1024 + 1);
    const { POST } = await import('@/app/api/tmp/upload/[token]/route');
    const req = makeUploadRequest(token, { name: 'big.bin', content: bigContent });
    const res = await POST(req, { params: Promise.resolve({ token }) });

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain('too large');
  });

  it('defaults extension to bin when file has no extension', async () => {
    const { token } = seedWebhook();

    const { POST } = await import('@/app/api/tmp/upload/[token]/route');
    const req = makeUploadRequest(token, { name: 'noext', content: 'data' });
    const res = await POST(req, { params: Promise.resolve({ token }) });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toMatch(/\.bin$/);
  });

  it('returns 500 when R2 upload fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { token } = seedWebhook();
    mockUploadBufferToR2.mockRejectedValue(new Error('R2 down'));

    const { POST } = await import('@/app/api/tmp/upload/[token]/route');
    const req = makeUploadRequest(token, { name: 'test.txt', content: 'data' });
    const res = await POST(req, { params: Promise.resolve({ token }) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to upload');
  });
});
