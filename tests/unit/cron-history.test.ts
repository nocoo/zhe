import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordCronResult,
  getCronHistory,
  clearCronHistory,
  type CronHistoryEntry,
} from '@/lib/cron-history';

function makeEntry(overrides: Partial<CronHistoryEntry> = {}): CronHistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    status: 'success',
    synced: 10,
    failed: 0,
    total: 10,
    durationMs: 150,
    ...overrides,
  };
}

describe('cron-history', () => {
  beforeEach(() => {
    clearCronHistory();
  });

  it('starts with empty history', () => {
    expect(getCronHistory()).toEqual([]);
  });

  it('records a single entry', () => {
    const entry = makeEntry({ synced: 5, total: 5 });
    recordCronResult(entry);

    const history = getCronHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(entry);
  });

  it('stores entries newest first', () => {
    const older = makeEntry({ timestamp: '2026-03-01T10:00:00Z', synced: 1 });
    const newer = makeEntry({ timestamp: '2026-03-01T10:15:00Z', synced: 2 });

    recordCronResult(older);
    recordCronResult(newer);

    const history = getCronHistory();
    expect(history).toHaveLength(2);
    expect(history[0].synced).toBe(2); // newer first
    expect(history[1].synced).toBe(1);
  });

  it('records error entries', () => {
    const entry = makeEntry({
      status: 'error',
      synced: 0,
      failed: 0,
      total: 0,
      error: 'D1 timeout',
    });
    recordCronResult(entry);

    const history = getCronHistory();
    expect(history[0].status).toBe('error');
    expect(history[0].error).toBe('D1 timeout');
  });

  it('evicts oldest entries when exceeding max (50)', () => {
    // Insert 55 entries
    for (let i = 0; i < 55; i++) {
      recordCronResult(makeEntry({ synced: i }));
    }

    const history = getCronHistory();
    expect(history).toHaveLength(50);
    // Newest (synced=54) should be first, oldest kept (synced=5) should be last
    expect(history[0].synced).toBe(54);
    expect(history[49].synced).toBe(5);
  });

  it('returns a shallow copy (mutations do not affect internal state)', () => {
    recordCronResult(makeEntry({ synced: 10 }));

    const copy = getCronHistory();
    copy.pop(); // mutate the copy

    // Internal state should be unaffected
    expect(getCronHistory()).toHaveLength(1);
  });

  it('clearCronHistory removes all entries', () => {
    recordCronResult(makeEntry());
    recordCronResult(makeEntry());
    expect(getCronHistory()).toHaveLength(2);

    clearCronHistory();
    expect(getCronHistory()).toEqual([]);
  });
});
