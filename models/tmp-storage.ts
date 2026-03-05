/**
 * Temporary file storage model.
 *
 * Handles naming conventions, age calculation, and cleanup logic for
 * ephemeral files stored in R2 under the `tmp/` prefix.
 *
 * File naming convention: `tmp/<uuid>_<timestamp>.<ext>`
 * - uuid: crypto.randomUUID()
 * - timestamp: Date.now() (milliseconds since epoch)
 * - ext: original file extension
 */

/** R2 prefix for temporary files. */
export const TMP_PREFIX = "tmp/";

/** Maximum age in milliseconds before a tmp file is eligible for cleanup (1 hour). */
export const TMP_MAX_AGE_MS = 60 * 60 * 1000;

/** Cleanup interval in milliseconds (30 minutes). */
export const TMP_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Extract the timestamp from a tmp file key.
 *
 * Expected format: `tmp/<uuid>_<timestamp>.<ext>`
 * Returns null if the key doesn't match the expected pattern.
 */
export function extractTimestampFromKey(key: string): number | null {
  // Strip prefix
  const filename = key.startsWith(TMP_PREFIX) ? key.slice(TMP_PREFIX.length) : key;

  // Match: <uuid>_<timestamp>.<ext>
  // UUID format: 8-4-4-4-12 hex chars
  const match = filename.match(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(\d+)\./,
  );
  if (!match) return null;

  const ts = Number(match[1]);
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Determine which tmp file keys are expired based on their filename timestamps.
 *
 * @param keys     Array of R2 object keys under `tmp/` prefix
 * @param nowMs    Current time in milliseconds (for testability)
 * @param maxAgeMs Maximum age in milliseconds (default: TMP_MAX_AGE_MS)
 * @returns Array of expired keys that should be deleted
 */
export function findExpiredTmpKeys(
  keys: string[],
  nowMs: number = Date.now(),
  maxAgeMs: number = TMP_MAX_AGE_MS,
): string[] {
  const cutoff = nowMs - maxAgeMs;

  return keys.filter((key) => {
    const ts = extractTimestampFromKey(key);
    // If we can't parse the timestamp, consider it expired (safe cleanup)
    if (ts === null) return true;
    return ts < cutoff;
  });
}

/** Summary of a tmp storage scan. */
export interface TmpStorageStats {
  /** Total number of files in tmp/ */
  totalFiles: number;
  /** Total size in bytes */
  totalSize: number;
}

/**
 * Compute tmp storage stats from a list of storage files.
 * Filters to files with keys starting with `tmp/`.
 */
export function computeTmpStats(
  files: { key: string; size: number }[],
): TmpStorageStats {
  let totalFiles = 0;
  let totalSize = 0;

  for (const file of files) {
    if (file.key.startsWith(TMP_PREFIX)) {
      totalFiles++;
      totalSize += file.size;
    }
  }

  return { totalFiles, totalSize };
}
