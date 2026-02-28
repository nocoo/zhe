/**
 * In-memory circular buffer for cron sync invocation history.
 *
 * Stores the last MAX_ENTRIES cron sync results. Resets on server restart.
 * No database table — this is intentionally ephemeral.
 */

export interface CronHistoryEntry {
  timestamp: string; // ISO 8601
  status: 'success' | 'error';
  synced: number;
  failed: number;
  total: number;
  durationMs: number;
  error?: string;
}

const MAX_ENTRIES = 50;
const history: CronHistoryEntry[] = [];

/** Record a cron sync result. Oldest entries are evicted when buffer is full. */
export function recordCronResult(entry: CronHistoryEntry): void {
  history.unshift(entry); // newest first
  if (history.length > MAX_ENTRIES) {
    history.length = MAX_ENTRIES;
  }
}

/** Get the cron history (newest first). Returns a shallow copy. */
export function getCronHistory(): CronHistoryEntry[] {
  return [...history];
}

/** Clear all history (for testing). */
export function clearCronHistory(): void {
  history.length = 0;
}
