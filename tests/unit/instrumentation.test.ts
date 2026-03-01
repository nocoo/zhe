vi.unmock('@/lib/kv/sync');

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPerformKVSync = vi.fn();

vi.mock('@/lib/kv/sync', () => ({
  performKVSync: () => mockPerformKVSync(),
}));

describe('instrumentation', () => {
  const originalRuntime = process.env.NEXT_RUNTIME;

  beforeEach(() => {
    mockPerformKVSync.mockReset();
    delete process.env.NEXT_RUNTIME;
  });

  afterEach(() => {
    if (originalRuntime !== undefined) {
      process.env.NEXT_RUNTIME = originalRuntime;
    } else {
      delete process.env.NEXT_RUNTIME;
    }
  });

  it('calls performKVSync on nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockPerformKVSync.mockResolvedValue({ synced: 10, failed: 0, total: 10, durationMs: 500 });

    const { register } = await import('@/instrumentation');
    await register();

    // performKVSync is fire-and-forget, wait for the microtask
    await new Promise((r) => setTimeout(r, 10));

    expect(mockPerformKVSync).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it('does not call performKVSync on non-nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';

    // Need to re-import with fresh module
    vi.resetModules();
    vi.mock('@/lib/kv/sync', () => ({
      performKVSync: () => mockPerformKVSync(),
    }));

    const { register } = await import('@/instrumentation');
    await register();

    await new Promise((r) => setTimeout(r, 10));

    expect(mockPerformKVSync).not.toHaveBeenCalled();
  });
});
