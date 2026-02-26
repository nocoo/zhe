import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockExecuteD1Query = vi.fn();
vi.mock('@/lib/db/d1-client', () => ({
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
}));

const mockListR2Objects = vi.fn();
const mockDeleteR2Objects = vi.fn();
vi.mock('@/lib/r2/client', () => ({
  listR2Objects: (...args: unknown[]) => mockListR2Objects(...args),
  deleteR2Objects: (...args: unknown[]) => mockDeleteR2Objects(...args),
}));

import { scanStorage, cleanupOrphanFiles } from '@/actions/storage';

// ── Helpers ──

function mockD1Counts(counts: Record<string, number>) {
  // Each executeD1Query call returns an array of rows
  const tables = ['links', 'uploads', 'analytics', 'folders', 'tags', 'webhooks'];
  for (const table of tables) {
    mockExecuteD1Query.mockResolvedValueOnce([{ count: counts[table] ?? 0 }]);
  }
}

function mockR2Queries({
  uploadKeys = [] as string[],
  screenshotUrls = [] as string[],
} = {}) {
  mockExecuteD1Query.mockResolvedValueOnce(uploadKeys.map((key) => ({ key })));
  mockExecuteD1Query.mockResolvedValueOnce(
    screenshotUrls.map((url) => ({ screenshot_url: url })),
  );
}

// ── Tests ──

describe('scanStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await scanStorage();
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns D1 and R2 stats on success', async () => {
    // D1 queries (6 COUNT queries)
    mockD1Counts({ links: 10, uploads: 5, analytics: 100, folders: 3, tags: 7, webhooks: 1 });

    // R2 queries (listR2Objects + 2 D1 queries for upload keys and screenshot urls)
    mockListR2Objects.mockResolvedValue([
      { key: 'file1.png', size: 1024, lastModified: '2026-01-01T00:00:00Z' },
    ]);
    mockR2Queries({
      uploadKeys: ['file1.png'],
      screenshotUrls: [],
    });

    const result = await scanStorage();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.d1.connected).toBe(true);
    expect(result.data!.d1.totalLinks).toBe(10);
    expect(result.data!.d1.totalUploads).toBe(5);
    expect(result.data!.d1.totalAnalytics).toBe(100);
    expect(result.data!.d1.tables).toHaveLength(6);
    expect(result.data!.r2.connected).toBe(true);
    expect(result.data!.r2.files).toHaveLength(1);
    expect(result.data!.r2.files[0].isReferenced).toBe(true);
  });

  it('returns D1 disconnected when D1 queries throw', async () => {
    // D1 getD1Stats throws
    mockExecuteD1Query.mockRejectedValueOnce(new Error('D1 unreachable'));
    // R2 still works
    mockListR2Objects.mockResolvedValue([]);
    mockR2Queries();

    const result = await scanStorage();

    expect(result.success).toBe(true);
    expect(result.data!.d1.connected).toBe(false);
    expect(result.data!.d1.totalLinks).toBe(0);
    expect(result.data!.d1.tables).toEqual([]);
  });

  it('returns R2 disconnected when listR2Objects throws', async () => {
    // D1 succeeds
    mockD1Counts({ links: 5, uploads: 2, analytics: 50, folders: 1, tags: 2, webhooks: 0 });
    // R2 fails
    mockListR2Objects.mockRejectedValue(new Error('R2 unreachable'));

    const result = await scanStorage();

    expect(result.success).toBe(true);
    expect(result.data!.d1.connected).toBe(true);
    expect(result.data!.r2.connected).toBe(false);
    expect(result.data!.r2.summary.totalFiles).toBe(0);
  });

  it('detects orphan files correctly', async () => {
    mockD1Counts({ links: 1, uploads: 1, analytics: 0, folders: 0, tags: 0, webhooks: 0 });

    mockListR2Objects.mockResolvedValue([
      { key: 'upload.png', size: 100, lastModified: '2026-01-01T00:00:00Z' },
      { key: 'orphan.png', size: 200, lastModified: '2026-01-02T00:00:00Z' },
      { key: 'screenshot.webp', size: 300, lastModified: '2026-01-03T00:00:00Z' },
    ]);
    mockR2Queries({
      uploadKeys: ['upload.png'],
      screenshotUrls: ['https://cdn.example.com/screenshot.webp'],
    });

    // Set R2_PUBLIC_DOMAIN for URL extraction
    process.env.R2_PUBLIC_DOMAIN = 'https://cdn.example.com';

    const result = await scanStorage();

    expect(result.success).toBe(true);
    expect(result.data!.r2.summary.totalFiles).toBe(3);
    expect(result.data!.r2.summary.orphanFiles).toBe(1);
    expect(result.data!.r2.summary.orphanSize).toBe(200);

    delete process.env.R2_PUBLIC_DOMAIN;
  });
});

describe('cleanupOrphanFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await cleanupOrphanFiles(['key1.png']);
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns error when no keys provided', async () => {
    const result = await cleanupOrphanFiles([]);
    expect(result).toEqual({ success: false, error: 'No keys provided' });
  });

  it('returns error when keys is not an array', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await cleanupOrphanFiles(null as any);
    expect(result).toEqual({ success: false, error: 'No keys provided' });
  });

  it('returns error when too many keys (> 5000)', async () => {
    const keys = Array.from({ length: 5001 }, (_, i) => `key-${i}.png`);
    const result = await cleanupOrphanFiles(keys);
    expect(result).toEqual({ success: false, error: 'Too many keys (max 5000 per request)' });
  });

  it('deletes confirmed orphan keys', async () => {
    // The cleanup action re-fetches upload keys and screenshot URLs for validation
    mockR2Queries({
      uploadKeys: ['referenced.png'],
      screenshotUrls: [],
    });
    mockDeleteR2Objects.mockResolvedValue(2);

    const result = await cleanupOrphanFiles(['orphan1.png', 'orphan2.png', 'referenced.png']);

    expect(result.success).toBe(true);
    expect(result.data!.deleted).toBe(2);
    expect(result.data!.skipped).toBe(1); // 'referenced.png' is in uploadKeys

    // deleteR2Objects should only receive confirmed orphans
    expect(mockDeleteR2Objects).toHaveBeenCalledWith(['orphan1.png', 'orphan2.png']);
  });

  it('skips all keys when all are referenced', async () => {
    mockR2Queries({
      uploadKeys: ['file1.png', 'file2.png'],
      screenshotUrls: [],
    });

    const result = await cleanupOrphanFiles(['file1.png', 'file2.png']);

    expect(result.success).toBe(true);
    expect(result.data!.deleted).toBe(0);
    expect(result.data!.skipped).toBe(2);
    expect(mockDeleteR2Objects).not.toHaveBeenCalled();
  });

  it('skips keys referenced by screenshot URLs', async () => {
    process.env.R2_PUBLIC_DOMAIN = 'https://cdn.example.com';

    mockR2Queries({
      uploadKeys: [],
      screenshotUrls: ['https://cdn.example.com/screenshot.webp'],
    });
    mockDeleteR2Objects.mockResolvedValue(1);

    const result = await cleanupOrphanFiles(['screenshot.webp', 'orphan.png']);

    expect(result.success).toBe(true);
    expect(result.data!.deleted).toBe(1);
    expect(result.data!.skipped).toBe(1);
    expect(mockDeleteR2Objects).toHaveBeenCalledWith(['orphan.png']);

    delete process.env.R2_PUBLIC_DOMAIN;
  });

  it('skips empty/invalid key strings', async () => {
    mockR2Queries({ uploadKeys: [], screenshotUrls: [] });
    mockDeleteR2Objects.mockResolvedValue(1);

    const result = await cleanupOrphanFiles(['', 'valid.png']);

    expect(result.success).toBe(true);
    expect(result.data!.deleted).toBe(1);
    expect(mockDeleteR2Objects).toHaveBeenCalledWith(['valid.png']);
  });

  it('returns error when deleteR2Objects throws', async () => {
    mockR2Queries({ uploadKeys: [], screenshotUrls: [] });
    mockDeleteR2Objects.mockRejectedValue(new Error('R2 delete failed'));

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await cleanupOrphanFiles(['orphan.png']);
    spy.mockRestore();

    expect(result.success).toBe(false);
    expect(result.error).toBe('R2 delete failed');
  });

  it('returns generic error message when non-Error is thrown', async () => {
    mockR2Queries({ uploadKeys: [], screenshotUrls: [] });
    mockDeleteR2Objects.mockRejectedValue('string error');

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await cleanupOrphanFiles(['orphan.png']);
    spy.mockRestore();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to cleanup orphan files');
  });
});
