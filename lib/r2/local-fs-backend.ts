/**
 * Local filesystem backend for R2 — used only when LOCAL_R2=1.
 *
 * Replaces the S3-compatible HTTP path with direct file operations under
 * LOCAL_R2_DIR (default `.test-storage/r2`). Keeps the public API of
 * `lib/r2/client.ts` identical so business code is unchanged.
 *
 * Presigned URLs are forged against the local HTTP shim
 * (`scripts/local-r2-server.ts`) at `http://127.0.0.1:${LOCAL_R2_PORT}`.
 * The shim accepts any key path and ignores signature parameters — production
 * code paths exercise the same call sites, just against a local writer.
 */

import { promises as fs } from 'fs';
import { dirname, join, normalize, resolve, sep } from 'path';

import type { R2Object } from './client';

const DEFAULT_DIR = '.test-storage/r2';
const DEFAULT_PORT = 18788;

function getRoot(): string {
  return resolve(process.cwd(), process.env.LOCAL_R2_DIR || DEFAULT_DIR);
}

function getPort(): number {
  const raw = process.env.LOCAL_R2_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

/**
 * Resolve `key` to an absolute path inside the root. Rejects traversal that
 * would escape the root (e.g. `../etc/passwd`).
 */
export function keyToPath(key: string): string {
  const root = getRoot();
  const stripped = key.replace(/^[/\\]+/, '');
  const full = normalize(resolve(root, stripped));
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`R2 key escapes storage root: ${key}`);
  }
  return full;
}

function pathToKey(absPath: string): string {
  const root = getRoot();
  const rel = absPath.slice(root.length + 1);
  return rel.split(sep).join('/');
}

async function ensureDirFor(file: string): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
}

/**
 * Mint a "presigned" PUT URL backed by the local HTTP shim. Signature is a
 * no-op — the shim accepts any key it can write under LOCAL_R2_DIR.
 */
export function createPresignedUploadUrl(key: string, contentType: string): string {
  const port = getPort();
  const params = new URLSearchParams({ key, contentType });
  return `http://127.0.0.1:${port}/upload?${params.toString()}`;
}

export async function uploadBufferToR2(
  key: string,
  body: Uint8Array,
  _contentType: string,
): Promise<void> {
  const path = keyToPath(key);
  await ensureDirFor(path);
  await fs.writeFile(path, body);
}

export async function deleteR2Object(key: string): Promise<void> {
  const path = keyToPath(key);
  try {
    await fs.unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

async function walk(dir: string, prefix?: string, out: R2Object[] = []): Promise<R2Object[]> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, prefix, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const key = pathToKey(full);
    if (prefix && !key.startsWith(prefix)) continue;
    const stat = await fs.stat(full);
    out.push({
      key,
      size: stat.size,
      lastModified: stat.mtime.toISOString(),
    });
  }
  return out;
}

export async function listR2Objects(prefix?: string): Promise<R2Object[]> {
  return walk(getRoot(), prefix);
}

export async function deleteR2Objects(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  let deleted = 0;
  for (const key of keys) {
    try {
      await fs.unlink(keyToPath(key));
      deleted += 1;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }
  return deleted;
}

/** Wipe the entire local R2 root. Used by test setup. */
export async function resetLocalR2(): Promise<void> {
  await fs.rm(getRoot(), { recursive: true, force: true });
  await fs.mkdir(getRoot(), { recursive: true });
}
