import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { resolve } from 'path';

import { resetLocalR2 } from '@/lib/r2/local-fs-backend';
import {
  startLocalR2Server,
  stopLocalR2Server,
  type LocalR2Server,
} from '@/scripts/local-r2-server';

const TEST_DIR = '.test-storage/r2-shim-test';
const PORT = 18801;
const BASE = `http://127.0.0.1:${PORT}`;

let handle: LocalR2Server;

const ORIGINAL_ENV: Record<string, string | undefined> = {};

function snap(...keys: string[]): void {
  for (const k of keys) ORIGINAL_ENV[k] = process.env[k];
}

beforeAll(async () => {
  snap('LOCAL_R2', 'LOCAL_R2_DIR', 'LOCAL_R2_PORT');
  process.env.LOCAL_R2 = '1';
  process.env.LOCAL_R2_DIR = TEST_DIR;
  process.env.LOCAL_R2_PORT = String(PORT);
  await resetLocalR2();
  handle = await startLocalR2Server(PORT);
});

afterAll(async () => {
  await stopLocalR2Server(handle);
  await fs.rm(resolve(process.cwd(), TEST_DIR), { recursive: true, force: true });
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

beforeEach(async () => {
  await resetLocalR2();
});

describe('local R2 HTTP shim', () => {
  it('responds to /__health', async () => {
    const res = await fetch(`${BASE}/__health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('PUT /upload?key=... writes the body to disk', async () => {
    const res = await fetch(`${BASE}/upload?key=a/b.txt&contentType=text/plain`, {
      method: 'PUT',
      body: 'hello shim',
    });
    expect(res.status).toBe(200);
    const onDisk = await fs.readFile(resolve(process.cwd(), TEST_DIR, 'a/b.txt'), 'utf-8');
    expect(onDisk).toBe('hello shim');
  });

  it('PUT /r2/<path> works as an S3-style write', async () => {
    const res = await fetch(`${BASE}/r2/folder/sub/file.bin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array([1, 2, 3, 4]),
    });
    expect(res.status).toBe(200);
    const onDisk = await fs.readFile(resolve(process.cwd(), TEST_DIR, 'folder/sub/file.bin'));
    expect(Array.from(onDisk)).toEqual([1, 2, 3, 4]);
  });

  it('GET /r2/<path> serves the file with a sensible content-type', async () => {
    await fetch(`${BASE}/upload?key=hello.png&contentType=image/png`, {
      method: 'PUT',
      body: 'fake-png-bytes',
    });
    const res = await fetch(`${BASE}/r2/hello.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(await res.text()).toBe('fake-png-bytes');
  });

  it('HEAD /r2/<path> returns metadata without a body', async () => {
    await fetch(`${BASE}/upload?key=size-check.txt&contentType=text/plain`, {
      method: 'PUT',
      body: 'twelve bytes',
    });
    const res = await fetch(`${BASE}/r2/size-check.txt`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('12');
  });

  it('GET on a missing key returns 404', async () => {
    const res = await fetch(`${BASE}/r2/missing.txt`);
    expect(res.status).toBe(404);
  });

  it('DELETE /r2/<path> removes the file', async () => {
    await fetch(`${BASE}/upload?key=del.txt&contentType=text/plain`, {
      method: 'PUT',
      body: 'bye',
    });
    const del = await fetch(`${BASE}/r2/del.txt`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    const get = await fetch(`${BASE}/r2/del.txt`);
    expect(get.status).toBe(404);
  });

  it('rejects unknown paths with 404', async () => {
    const res = await fetch(`${BASE}/random/path`);
    expect(res.status).toBe(404);
  });

  it('rejects keys that escape the storage root with 500', async () => {
    const res = await fetch(`${BASE}/upload?key=../escape.txt`, {
      method: 'PUT',
      body: 'x',
    });
    expect(res.status).toBe(500);
    expect(await res.text()).toMatch(/escapes storage root/);
  });
});
