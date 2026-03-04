import { describe, it, expect } from 'vitest';
import {
  extractTimestampFromKey,
  findExpiredTmpKeys,
  TMP_PREFIX,
  TMP_MAX_AGE_MS,
  TMP_CLEANUP_INTERVAL_MS,
} from '@/models/tmp-storage';

// ── Constants ──

describe('constants', () => {
  it('TMP_PREFIX is "tmp/"', () => {
    expect(TMP_PREFIX).toBe('tmp/');
  });

  it('TMP_MAX_AGE_MS is 1 hour', () => {
    expect(TMP_MAX_AGE_MS).toBe(3_600_000);
  });

  it('TMP_CLEANUP_INTERVAL_MS is 10 minutes', () => {
    expect(TMP_CLEANUP_INTERVAL_MS).toBe(600_000);
  });
});

// ── extractTimestampFromKey ──

describe('extractTimestampFromKey', () => {
  it('extracts timestamp from a valid tmp key', () => {
    const ts = 1709500000000;
    const key = `tmp/17ab9eca-f303-4e1e-8c4f-65a0a30e3041_${ts}.zip`;
    expect(extractTimestampFromKey(key)).toBe(ts);
  });

  it('extracts timestamp without the tmp/ prefix', () => {
    const ts = 1709500000000;
    const filename = `17ab9eca-f303-4e1e-8c4f-65a0a30e3041_${ts}.zip`;
    expect(extractTimestampFromKey(filename)).toBe(ts);
  });

  it('handles various file extensions', () => {
    const ts = 1709500000000;
    const uuid = '17ab9eca-f303-4e1e-8c4f-65a0a30e3041';

    expect(extractTimestampFromKey(`tmp/${uuid}_${ts}.png`)).toBe(ts);
    expect(extractTimestampFromKey(`tmp/${uuid}_${ts}.tar.gz`)).toBe(ts);
    expect(extractTimestampFromKey(`tmp/${uuid}_${ts}.bin`)).toBe(ts);
  });

  it('returns null for non-UUID prefix', () => {
    expect(extractTimestampFromKey('tmp/not-a-uuid_12345.zip')).toBeNull();
  });

  it('returns null for missing timestamp', () => {
    expect(extractTimestampFromKey('tmp/17ab9eca-f303-4e1e-8c4f-65a0a30e3041.zip')).toBeNull();
  });

  it('returns null for missing extension', () => {
    expect(extractTimestampFromKey('tmp/17ab9eca-f303-4e1e-8c4f-65a0a30e3041_12345')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractTimestampFromKey('')).toBeNull();
  });

  it('returns null for non-tmp paths', () => {
    expect(extractTimestampFromKey('uploads/somefile.png')).toBeNull();
  });

  it('returns null for NaN timestamp', () => {
    // Regex won't match non-digit characters in timestamp position
    expect(extractTimestampFromKey('tmp/17ab9eca-f303-4e1e-8c4f-65a0a30e3041_abc.zip')).toBeNull();
  });
});

// ── findExpiredTmpKeys ──

describe('findExpiredTmpKeys', () => {
  const uuid = '17ab9eca-f303-4e1e-8c4f-65a0a30e3041';
  const NOW = 1709510000000;

  function makeKey(ts: number, ext = 'zip'): string {
    return `tmp/${uuid}_${ts}.${ext}`;
  }

  it('returns empty array when no keys provided', () => {
    expect(findExpiredTmpKeys([], NOW)).toEqual([]);
  });

  it('returns expired keys (older than 1 hour)', () => {
    const oldKey = makeKey(NOW - TMP_MAX_AGE_MS - 1); // 1ms past expiration
    const freshKey = makeKey(NOW - 1000); // 1s old

    const expired = findExpiredTmpKeys([oldKey, freshKey], NOW);
    expect(expired).toEqual([oldKey]);
  });

  it('does not expire keys exactly at the boundary', () => {
    const boundaryKey = makeKey(NOW - TMP_MAX_AGE_MS); // exactly at cutoff
    const expired = findExpiredTmpKeys([boundaryKey], NOW);
    // cutoff = NOW - TMP_MAX_AGE_MS; key ts == cutoff → NOT expired (< cutoff is expired)
    expect(expired).toEqual([]);
  });

  it('expires keys 1ms past the boundary', () => {
    const pastBoundary = makeKey(NOW - TMP_MAX_AGE_MS - 1);
    const expired = findExpiredTmpKeys([pastBoundary], NOW);
    expect(expired).toEqual([pastBoundary]);
  });

  it('treats unparseable keys as expired (safe cleanup)', () => {
    const badKey = 'tmp/garbage-file.zip';
    const expired = findExpiredTmpKeys([badKey], NOW);
    expect(expired).toEqual([badKey]);
  });

  it('returns all keys when all are expired', () => {
    const keys = [
      makeKey(NOW - TMP_MAX_AGE_MS - 1000),
      makeKey(NOW - TMP_MAX_AGE_MS - 2000),
      makeKey(NOW - TMP_MAX_AGE_MS - 3000),
    ];
    const expired = findExpiredTmpKeys(keys, NOW);
    expect(expired).toEqual(keys);
  });

  it('returns no keys when all are fresh', () => {
    const keys = [
      makeKey(NOW - 1000),
      makeKey(NOW - 2000),
      makeKey(NOW - 30_000),
    ];
    const expired = findExpiredTmpKeys(keys, NOW);
    expect(expired).toEqual([]);
  });

  it('supports custom maxAgeMs', () => {
    const customMaxAge = 5 * 60 * 1000; // 5 minutes
    const key = makeKey(NOW - 6 * 60 * 1000); // 6 minutes old
    const fresh = makeKey(NOW - 1000);

    const expired = findExpiredTmpKeys([key, fresh], NOW, customMaxAge);
    expect(expired).toEqual([key]);
  });
});
