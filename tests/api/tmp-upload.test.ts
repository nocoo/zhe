/**
 * L2 API E2E Tests for /api/tmp/upload/[token]
 *
 * Tests the tmp upload endpoint via real HTTP.
 * HEAD (connection test), GET (info/docs), POST (file upload).
 *
 * POST uploads go to the R2 test bucket. Seeded via D1 HTTP API.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { apiGet, apiHead, jsonResponse } from './helpers/http';
import {  seedWebhook, cleanupTestData, resetAndSeedUser } from './helpers/seed';

const BASE_URL = process.env.API_E2E_BASE_URL ?? 'http://localhost:17006';
const TEST_USER_ID = 'api-tmp-upload-test-user';

let webhookToken: string;

beforeAll(async () => {
  await resetAndSeedUser(TEST_USER_ID);
  const wh = await seedWebhook({ userId: TEST_USER_ID });
  webhookToken = wh.token;
});

afterAll(async () => {
  await cleanupTestData(TEST_USER_ID);
});

// ============================================================
// HEAD — Connection Test
// ============================================================
describe('HEAD /api/tmp/upload/[token]', () => {
  it('returns 200 for a valid token', async () => {
    const res = await apiHead(`/api/tmp/upload/${webhookToken}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for an invalid token', async () => {
    const res = await apiHead('/api/tmp/upload/bad-token');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// GET — Info & Docs
// ============================================================
describe('GET /api/tmp/upload/[token]', () => {
  it('returns endpoint info for a valid token', async () => {
    const res = await apiGet(`/api/tmp/upload/${webhookToken}`);
    const { status, body } = await jsonResponse<{
      status: string;
      description: string;
      maxFileSize: string;
      usage: { method: string; field: string; example: string };
    }>(res);

    expect(status).toBe(200);
    expect(body.status).toBe('active');
    expect(body.description).toContain('Temporary file upload');
    expect(body.maxFileSize).toBe('10 MB');
    expect(body.usage.method).toBe('POST');
    expect(body.usage.field).toBe('file');
    expect(body.usage.example).toContain(webhookToken);
  });

  it('returns 404 for an invalid token', async () => {
    const res = await apiGet('/api/tmp/upload/bad-token');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// POST — File Upload
// ============================================================
describe('POST /api/tmp/upload/[token]', () => {
  it('uploads a file and returns key, url, size, contentType', async () => {
    const formData = new FormData();
    const content = new Blob(['hello world'], { type: 'text/plain' });
    formData.append('file', content, 'test.txt');

    const res = await fetch(`${BASE_URL}/api/tmp/upload/${webhookToken}`, {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.key).toMatch(/^tmp\/[0-9a-f-]+_\d+\.txt$/);
    expect(body.url).toContain(body.key);
    expect(body.size).toBe(11); // 'hello world'.length
    expect(body.contentType).toBe('text/plain');
  });

  it('returns 404 for an invalid token', async () => {
    const formData = new FormData();
    const content = new Blob(['data'], { type: 'application/octet-stream' });
    formData.append('file', content, 'file.bin');

    const res = await fetch(`${BASE_URL}/api/tmp/upload/bad-token`, {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 when file field is missing', async () => {
    const formData = new FormData();
    formData.append('notfile', 'some string value');

    const res = await fetch(`${BASE_URL}/api/tmp/upload/${webhookToken}`, {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('file');
  });

  it('returns 400 for empty file', async () => {
    const formData = new FormData();
    const content = new Blob([], { type: 'text/plain' });
    formData.append('file', content, 'empty.txt');

    const res = await fetch(`${BASE_URL}/api/tmp/upload/${webhookToken}`, {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('empty');
  });
});
