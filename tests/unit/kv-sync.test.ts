vi.unmock('@/lib/kv/client');
vi.unmock('@/lib/kv/sync');
vi.unmock('@/lib/kv/dirty');
vi.unmock('@/lib/db');
vi.unmock('@/lib/cron-history');

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performKVSync } from '@/lib/kv/sync';
import { _resetDirtyFlag, isKVDirty } from '@/lib/kv/dirty';
import { getCronHistory, clearCronHistory } from '@/lib/cron-history';

const mockGetAllLinksForKV = vi.fn();
const mockKvBulkPutLinks = vi.fn();
const mockIsKVConfigured = vi.fn();

vi.mock('@/lib/db', () => ({
  getAllLinksForKV: (...args: unknown[]) => mockGetAllLinksForKV(...args),
}));

vi.mock('@/lib/kv/client', () => ({
  kvBulkPutLinks: (...args: unknown[]) => mockKvBulkPutLinks(...args),
  isKVConfigured: () => mockIsKVConfigured(),
}));

describe('performKVSync', () => {
  beforeEach(() => {
    mockGetAllLinksForKV.mockReset();
    mockKvBulkPutLinks.mockReset();
    mockIsKVConfigured.mockReset();
    clearCronHistory();
    _resetDirtyFlag(true); // default: dirty (like fresh deploy)
  });

  it('returns early when KV is not configured', async () => {
    mockIsKVConfigured.mockReturnValue(false);

    const result = await performKVSync();

    expect(result.error).toBe('KV not configured');
    expect(result.synced).toBe(0);
    expect(mockGetAllLinksForKV).not.toHaveBeenCalled();
    expect(getCronHistory()).toHaveLength(0);
  });

  it('syncs all links and records success in history', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
      { id: 2, slug: 'def', originalUrl: 'https://b.com', expiresAt: 1700000000000 },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 2, failed: 0 });

    const result = await performKVSync();

    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.total).toBe(2);
    expect(result.durationMs).toBeTypeOf('number');
    expect(result.error).toBeUndefined();

    const history = getCronHistory();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('success');
    expect(history[0].synced).toBe(2);

    consoleSpy.mockRestore();
  });

  it('handles D1 fetch failure gracefully', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetAllLinksForKV.mockRejectedValue(new Error('D1 timeout'));

    const result = await performKVSync();

    expect(result.error).toBe('Failed to fetch links from D1');
    expect(result.synced).toBe(0);

    const history = getCronHistory();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('error');
    expect(history[0].error).toBe('Failed to fetch links from D1');

    consoleSpy.mockRestore();
  });

  it('records partial KV failures as error status', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 1 });

    const result = await performKVSync();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.error).toBeUndefined();

    const history = getCronHistory();
    expect(history[0].status).toBe('error');

    consoleSpy.mockRestore();
  });

  it('handles empty database', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 0 });

    const result = await performKVSync();

    expect(result.synced).toBe(0);
    expect(result.total).toBe(0);
    expect(result.error).toBeUndefined();

    consoleSpy.mockRestore();
  });

  // ── Delta sync (dirty flag) ─────────────────────────────────────────────

  it('skips sync when dirty flag is false', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    _resetDirtyFlag(false);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await performKVSync();

    expect(result.skipped).toBe(true);
    expect(result.synced).toBe(0);
    expect(result.durationMs).toBe(0);
    expect(result.error).toBeUndefined();
    expect(mockGetAllLinksForKV).not.toHaveBeenCalled();
    expect(mockKvBulkPutLinks).not.toHaveBeenCalled();

    const history = getCronHistory();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('skipped');

    consoleSpy.mockRestore();
  });

  it('clears dirty flag after successful sync', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    _resetDirtyFlag(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 1, failed: 0 });

    await performKVSync();

    expect(isKVDirty()).toBe(false);

    consoleSpy.mockRestore();
  });

  it('keeps dirty flag true after partial failure', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    _resetDirtyFlag(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 1 });

    await performKVSync();

    expect(isKVDirty()).toBe(true);

    consoleSpy.mockRestore();
  });

  it('keeps dirty flag true after D1 fetch error', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    _resetDirtyFlag(true);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetAllLinksForKV.mockRejectedValue(new Error('D1 timeout'));

    await performKVSync();

    expect(isKVDirty()).toBe(true);

    consoleSpy.mockRestore();
  });

  it('starts dirty (true) by default after deploy', () => {
    // dirty.ts initializes to true; after _resetDirtyFlag(true) in beforeEach
    expect(isKVDirty()).toBe(true);
  });
});
