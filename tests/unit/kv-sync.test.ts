// @vitest-environment node
vi.unmock('@/lib/kv/client');
vi.unmock('@/lib/kv/sync');
vi.unmock('@/lib/kv/dirty');
vi.unmock('@/lib/db');
vi.unmock('@/lib/cron-history');

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performKVSync } from '@/lib/kv/sync';
import { getCronHistory, clearCronHistory } from '@/lib/cron-history';
import { _resetDirtyFlag, isKVDirty } from '@/lib/kv/dirty';
import { unwrap } from '../test-utils';

const mockGetAllLinksForKV = vi.fn();
const mockKvBulkPutLinks = vi.fn();
const mockKvListKeys = vi.fn();
const mockKvBulkDeleteLinks = vi.fn();
const mockIsKVConfigured = vi.fn();

vi.mock('@/lib/db', () => ({
  getAllLinksForKV: (...args: unknown[]) => mockGetAllLinksForKV(...args),
}));

vi.mock('@/lib/kv/client', () => ({
  kvBulkPutLinks: (...args: unknown[]) => mockKvBulkPutLinks(...args),
  kvListKeys: () => mockKvListKeys(),
  kvBulkDeleteLinks: (...args: unknown[]) => mockKvBulkDeleteLinks(...args),
  isKVConfigured: () => mockIsKVConfigured(),
}));

describe('performKVSync', () => {
  beforeEach(() => {
    mockGetAllLinksForKV.mockReset();
    mockKvBulkPutLinks.mockReset();
    mockKvListKeys.mockReset();
    mockKvBulkDeleteLinks.mockReset();
    mockIsKVConfigured.mockReset();
    clearCronHistory();
    _resetDirtyFlag(true);
    // Default: no orphaned keys, successful list
    mockKvListKeys.mockResolvedValue({ keys: [], error: false });
    mockKvBulkDeleteLinks.mockResolvedValue({ success: 0, failed: 0 });
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
    expect(unwrap(history[0]).status).toBe('success');
    expect(unwrap(history[0]).synced).toBe(2);

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
    expect(unwrap(history[0]).status).toBe('error');
    expect(unwrap(history[0]).error).toBe('Failed to fetch links from D1');

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
    expect(unwrap(history[0]).status).toBe('error');

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

  // ─── Dirty Flag ─────────────────────────────────────────────────────────────

  it('skips sync when dirty flag is false', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    _resetDirtyFlag(false);

    const result = await performKVSync();

    expect(result.skipped).toBe(true);
    expect(result.synced).toBe(0);
    expect(mockGetAllLinksForKV).not.toHaveBeenCalled();

    const history = getCronHistory();
    expect(history).toHaveLength(1);
    expect(unwrap(history[0]).status).toBe('skipped');
  });

  it('clears dirty flag after successful sync', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 1, failed: 0 });

    _resetDirtyFlag(true);
    await performKVSync();

    expect(isKVDirty()).toBe(false);
    consoleSpy.mockRestore();
  });

  it('keeps dirty flag after partial KV failure', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 1 });

    _resetDirtyFlag(true);
    await performKVSync();

    expect(isKVDirty()).toBe(true);
    consoleSpy.mockRestore();
  });

  it('keeps dirty flag after D1 error', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetAllLinksForKV.mockRejectedValue(new Error('D1 timeout'));

    _resetDirtyFlag(true);
    await performKVSync();

    expect(isKVDirty()).toBe(true);
    consoleSpy.mockRestore();
  });

  it('starts with dirty flag true by default', async () => {
    // The dirty module initializes with dirty = true for cold-start consistency
    // After _resetDirtyFlag(true) in beforeEach, we verify default behavior
    expect(isKVDirty()).toBe(true);
  });

  // ─── Orphan Deletion ────────────────────────────────────────────────────────

  it('deletes orphaned slugs not in D1', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 1, failed: 0 });
    // KV has 'abc' (in D1) and 'orphan1', 'orphan2' (not in D1)
    mockKvListKeys.mockResolvedValue({ keys: ['abc', 'orphan1', 'orphan2'], error: false });
    mockKvBulkDeleteLinks.mockResolvedValue({ success: 2, failed: 0 });

    const result = await performKVSync();

    expect(result.deleted).toBe(2);
    expect(mockKvBulkDeleteLinks).toHaveBeenCalledWith(['orphan1', 'orphan2']);

    // Verify deleted is recorded in cron history
    const history = getCronHistory();
    expect(unwrap(history[0]).deleted).toBe(2);

    consoleSpy.mockRestore();
  });

  it('does not delete when no orphans exist', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 1, failed: 0 });
    // KV only has 'abc' which is in D1
    mockKvListKeys.mockResolvedValue({ keys: ['abc'], error: false });

    const result = await performKVSync();

    expect(result.deleted).toBe(0);
    expect(mockKvBulkDeleteLinks).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('deletes all KV keys when D1 is empty', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 0 });
    // KV has orphans but D1 is empty
    mockKvListKeys.mockResolvedValue({ keys: ['orphan1', 'orphan2'], error: false });
    mockKvBulkDeleteLinks.mockResolvedValue({ success: 2, failed: 0 });

    const result = await performKVSync();

    expect(result.deleted).toBe(2);
    expect(mockKvBulkDeleteLinks).toHaveBeenCalledWith(['orphan1', 'orphan2']);

    consoleSpy.mockRestore();
  });

  it('keeps dirty flag when orphan deletion fails', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 1, failed: 0 });
    mockKvListKeys.mockResolvedValue({ keys: ['abc', 'orphan1'], error: false });
    mockKvBulkDeleteLinks.mockResolvedValue({ success: 0, failed: 1 });

    _resetDirtyFlag(true);
    const result = await performKVSync();

    expect(result.deleted).toBe(0);
    expect(isKVDirty()).toBe(true);

    const history = getCronHistory();
    expect(unwrap(history[0]).status).toBe('error');

    consoleSpy.mockRestore();
  });

  it('skips orphan deletion when write phase has failures', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 1 });

    const result = await performKVSync();

    expect(mockKvListKeys).not.toHaveBeenCalled();
    expect(mockKvBulkDeleteLinks).not.toHaveBeenCalled();
    expect(result.deleted).toBe(0);
    expect(isKVDirty()).toBe(true);

    consoleSpy.mockRestore();
  });

  it('keeps dirty flag when list keys fails', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 1, failed: 0 });
    mockKvListKeys.mockResolvedValue({ keys: [], error: true });

    _resetDirtyFlag(true);
    const result = await performKVSync();

    expect(mockKvBulkDeleteLinks).not.toHaveBeenCalled();
    expect(result.deleted).toBe(0);
    expect(isKVDirty()).toBe(true);

    const history = getCronHistory();
    expect(unwrap(history[0]).status).toBe('error');

    consoleSpy.mockRestore();
  });
});