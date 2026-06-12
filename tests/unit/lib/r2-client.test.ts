import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { resolve } from 'path';

import {
  createPresignedUploadUrl,
  deleteR2Object,
  deleteR2Objects,
  listR2Objects,
  uploadBufferToR2,
} from '@/lib/r2/client';
import { keyToPath, resetLocalR2 } from '@/lib/r2/local-fs-backend';

const TEST_DIR = '.test-storage/r2-unit';

const ORIGINAL_ENV: Record<string, string | undefined> = {};

function snapshotEnv(...keys: string[]): void {
  for (const k of keys) ORIGINAL_ENV[k] = process.env[k];
}

function restoreEnv(): void {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe('r2 client — LOCAL_R2 mode', () => {
  beforeEach(async () => {
    snapshotEnv('LOCAL_R2', 'LOCAL_R2_DIR', 'LOCAL_R2_PORT');
    process.env.LOCAL_R2 = '1';
    process.env.LOCAL_R2_DIR = TEST_DIR;
    process.env.LOCAL_R2_PORT = '18799';
    await resetLocalR2();
  });

  afterEach(async () => {
    await fs.rm(resolve(process.cwd(), TEST_DIR), { recursive: true, force: true });
    restoreEnv();
  });

  it('uploadBufferToR2 writes a file under the storage root', async () => {
    await uploadBufferToR2('a/b/test.txt', new TextEncoder().encode('hello'), 'text/plain');
    const path = keyToPath('a/b/test.txt');
    const content = await fs.readFile(path, 'utf-8');
    expect(content).toBe('hello');
  });

  it('createPresignedUploadUrl returns a local shim URL', async () => {
    const url = await createPresignedUploadUrl('x/y.png', 'image/png');
    expect(url.startsWith('http://127.0.0.1:18799/upload?')).toBe(true);
    expect(url).toContain('key=x%2Fy.png');
    expect(url).toContain('contentType=image%2Fpng');
  });

  it('listR2Objects returns uploaded files (with prefix filter)', async () => {
    await uploadBufferToR2('p/one.txt', new TextEncoder().encode('1'), 'text/plain');
    await uploadBufferToR2('p/two.txt', new TextEncoder().encode('22'), 'text/plain');
    await uploadBufferToR2('q/other.txt', new TextEncoder().encode('zzz'), 'text/plain');

    const all = await listR2Objects();
    expect(all.map((o) => o.key).sort()).toEqual(['p/one.txt', 'p/two.txt', 'q/other.txt']);

    const onlyP = await listR2Objects('p/');
    expect(onlyP.map((o) => o.key).sort()).toEqual(['p/one.txt', 'p/two.txt']);
    const two = onlyP.find((o) => o.key === 'p/two.txt');
    expect(two?.size).toBe(2);
    expect(two?.lastModified).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('deleteR2Object removes a file (no-op on missing)', async () => {
    await uploadBufferToR2('del.txt', new TextEncoder().encode('x'), 'text/plain');
    await deleteR2Object('del.txt');
    await expect(fs.access(keyToPath('del.txt'))).rejects.toThrow();
    await deleteR2Object('does-not-exist.txt');
  });

  it('deleteR2Objects bulk-deletes and counts only files that existed', async () => {
    await uploadBufferToR2('a.txt', new TextEncoder().encode('a'), 'text/plain');
    await uploadBufferToR2('b.txt', new TextEncoder().encode('b'), 'text/plain');
    const count = await deleteR2Objects(['a.txt', 'b.txt', 'missing.txt']);
    expect(count).toBe(2);
    expect(await listR2Objects()).toEqual([]);
  });

  it('rejects keys that escape the storage root', async () => {
    expect(() => keyToPath('../escape.txt')).toThrow(/escapes storage root/);
  });
});

describe('r2 client — production mode unchanged', () => {
  beforeEach(() => {
    snapshotEnv('LOCAL_R2');
    delete process.env.LOCAL_R2;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('throws missing-config error when called without R2 creds', async () => {
    snapshotEnv('R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET_NAME');
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_BUCKET_NAME;
    try {
      await expect(createPresignedUploadUrl('k', 'text/plain')).rejects.toThrow(
        /Missing R2 configuration/,
      );
    } finally {
      restoreEnv();
    }
  });
});
