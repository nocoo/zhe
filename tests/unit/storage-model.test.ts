import { describe, it, expect } from 'vitest';
import {
  classifyR2Objects,
  extractKeyFromUrl,
  computeSummary,
  formatBytes,
  getFileName,
  getFileCategory,
} from '@/models/storage';
import type { StorageFile } from '@/models/storage';
import type { R2Object } from '@/lib/r2/client';

// ── Helpers ──

function makeR2Object(overrides: Partial<R2Object> = {}): R2Object {
  return {
    key: 'abc123/20260101/file.png',
    size: 1024,
    lastModified: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeStorageFile(overrides: Partial<StorageFile> = {}): StorageFile {
  return {
    key: 'abc123/20260101/file.png',
    size: 1024,
    lastModified: '2026-01-01T00:00:00Z',
    isReferenced: true,
    publicUrl: 'https://cdn.example.com/abc123/20260101/file.png',
    ...overrides,
  };
}

const DOMAIN = 'https://cdn.example.com';

// ── classifyR2Objects ──

describe('classifyR2Objects', () => {
  it('marks a file as referenced when its key is in uploadKeys', () => {
    const objects = [makeR2Object()];
    const uploadKeys = new Set([objects[0].key]);
    const screenshotKeys = new Set<string>();

    const result = classifyR2Objects(objects, uploadKeys, screenshotKeys, DOMAIN);

    expect(result).toHaveLength(1);
    expect(result[0].isReferenced).toBe(true);
    expect(result[0].publicUrl).toBe(`${DOMAIN}/${objects[0].key}`);
  });

  it('marks a file as referenced when its key is in screenshotKeys', () => {
    const key = 'abc123/20260101/screenshot.webp';
    const objects = [makeR2Object({ key })];
    const uploadKeys = new Set<string>();
    const screenshotKeys = new Set([key]);

    const result = classifyR2Objects(objects, uploadKeys, screenshotKeys, DOMAIN);

    expect(result[0].isReferenced).toBe(true);
  });

  it('marks a file as orphan when not in either set', () => {
    const objects = [makeR2Object({ key: 'orphan/file.png' })];
    const uploadKeys = new Set<string>();
    const screenshotKeys = new Set<string>();

    const result = classifyR2Objects(objects, uploadKeys, screenshotKeys, DOMAIN);

    expect(result[0].isReferenced).toBe(false);
  });

  it('handles empty input', () => {
    const result = classifyR2Objects([], new Set(), new Set(), DOMAIN);
    expect(result).toEqual([]);
  });

  it('classifies mixed referenced and orphan files correctly', () => {
    const objects = [
      makeR2Object({ key: 'a/1.png', size: 100 }),
      makeR2Object({ key: 'b/2.png', size: 200 }),
      makeR2Object({ key: 'c/3.png', size: 300 }),
    ];
    const uploadKeys = new Set(['a/1.png']);
    const screenshotKeys = new Set(['c/3.png']);

    const result = classifyR2Objects(objects, uploadKeys, screenshotKeys, DOMAIN);

    expect(result[0].isReferenced).toBe(true);  // in uploadKeys
    expect(result[1].isReferenced).toBe(false); // orphan
    expect(result[2].isReferenced).toBe(true);  // in screenshotKeys
  });

  it('strips trailing slash from domain when building URL', () => {
    const objects = [makeR2Object({ key: 'file.png' })];
    const result = classifyR2Objects(objects, new Set(), new Set(), 'https://cdn.example.com/');

    expect(result[0].publicUrl).toBe('https://cdn.example.com/file.png');
  });
});

// ── extractKeyFromUrl ──

describe('extractKeyFromUrl', () => {
  it('extracts key from a valid screenshot URL', () => {
    const url = 'https://cdn.example.com/abc123/20260101/uuid.webp';
    const key = extractKeyFromUrl(url, DOMAIN);
    expect(key).toBe('abc123/20260101/uuid.webp');
  });

  it('returns null if URL does not start with the domain prefix', () => {
    const url = 'https://other.com/abc123/20260101/uuid.webp';
    const key = extractKeyFromUrl(url, DOMAIN);
    expect(key).toBeNull();
  });

  it('handles domain with trailing slash', () => {
    const url = 'https://cdn.example.com/file.png';
    const key = extractKeyFromUrl(url, 'https://cdn.example.com/');
    expect(key).toBe('file.png');
  });

  it('returns null for empty URL', () => {
    expect(extractKeyFromUrl('', DOMAIN)).toBeNull();
  });

  it('extracts deeply nested keys', () => {
    const url = 'https://cdn.example.com/a/b/c/d/e.png';
    expect(extractKeyFromUrl(url, DOMAIN)).toBe('a/b/c/d/e.png');
  });
});

// ── computeSummary ──

describe('computeSummary', () => {
  it('returns zeroed summary for empty file list', () => {
    const summary = computeSummary([]);
    expect(summary).toEqual({
      totalFiles: 0,
      totalSize: 0,
      orphanFiles: 0,
      orphanSize: 0,
    });
  });

  it('computes correct totals for all-referenced files', () => {
    const files = [
      makeStorageFile({ size: 100, isReferenced: true }),
      makeStorageFile({ size: 200, isReferenced: true }),
    ];
    const summary = computeSummary(files);
    expect(summary).toEqual({
      totalFiles: 2,
      totalSize: 300,
      orphanFiles: 0,
      orphanSize: 0,
    });
  });

  it('computes correct totals for all-orphan files', () => {
    const files = [
      makeStorageFile({ size: 500, isReferenced: false }),
      makeStorageFile({ size: 300, isReferenced: false }),
    ];
    const summary = computeSummary(files);
    expect(summary).toEqual({
      totalFiles: 2,
      totalSize: 800,
      orphanFiles: 2,
      orphanSize: 800,
    });
  });

  it('computes correct totals for mixed files', () => {
    const files = [
      makeStorageFile({ size: 1000, isReferenced: true }),
      makeStorageFile({ size: 2000, isReferenced: false }),
      makeStorageFile({ size: 3000, isReferenced: true }),
      makeStorageFile({ size: 4000, isReferenced: false }),
    ];
    const summary = computeSummary(files);
    expect(summary).toEqual({
      totalFiles: 4,
      totalSize: 10000,
      orphanFiles: 2,
      orphanSize: 6000,
    });
  });
});

// ── formatBytes ──

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes (< 1 KB)', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });

  it('caps at GB for very large values', () => {
    // 2 TB = 2048 GB — should still format as GB since that's the max unit
    expect(formatBytes(2 * 1024 ** 4)).toBe('2048.0 GB');
  });

  it('formats 1 byte', () => {
    expect(formatBytes(1)).toBe('1 B');
  });
});

// ── getFileName ──

describe('getFileName', () => {
  it('extracts file name from a path with directories', () => {
    expect(getFileName('abc123/20260101/image.png')).toBe('image.png');
  });

  it('returns the key itself when no slash present', () => {
    expect(getFileName('image.png')).toBe('image.png');
  });

  it('handles deeply nested paths', () => {
    expect(getFileName('a/b/c/d/file.txt')).toBe('file.txt');
  });

  it('handles trailing slash edge case', () => {
    // This is an unlikely key, but pop() returns '' for 'foo/'
    expect(getFileName('folder/')).toBe('');
  });
});

// ── getFileCategory ──

describe('getFileCategory', () => {
  it.each([
    ['photo.jpg', 'image'],
    ['photo.jpeg', 'image'],
    ['photo.png', 'image'],
    ['photo.gif', 'image'],
    ['photo.webp', 'image'],
    ['icon.svg', 'image'],
    ['photo.avif', 'image'],
    ['favicon.ico', 'image'],
  ] as const)('categorizes %s as image', (key, expected) => {
    expect(getFileCategory(key)).toBe(expected);
  });

  it.each([
    ['document.pdf', 'document'],
    ['document.doc', 'document'],
    ['document.docx', 'document'],
    ['readme.txt', 'document'],
    ['notes.md', 'document'],
    ['data.json', 'document'],
    ['data.csv', 'document'],
  ] as const)('categorizes %s as document', (key, expected) => {
    expect(getFileCategory(key)).toBe(expected);
  });

  it.each([
    ['archive.zip', 'other'],
    ['video.mp4', 'other'],
    ['unknown', 'other'],
    ['noext', 'other'],
  ] as const)('categorizes %s as other', (key, expected) => {
    expect(getFileCategory(key)).toBe(expected);
  });

  it('is case insensitive for extensions', () => {
    expect(getFileCategory('PHOTO.PNG')).toBe('image');
    expect(getFileCategory('DOC.PDF')).toBe('document');
  });
});
