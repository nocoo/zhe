/** Inclusive UTC bounds for todo due dates (calendar years 1–9999). */
export const DUE_AT_MS_MIN = Date.UTC(1, 0, 1, 0, 0, 0, 0);
export const DUE_AT_MS_MAX = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

/** Reject NaN, non-safe integers, out-of-range values, and Invalid Date milliseconds. */
export function isValidDueAtMs(ms: number): boolean {
  if (!Number.isFinite(ms) || !Number.isSafeInteger(ms)) return false;
  if (ms < DUE_AT_MS_MIN || ms > DUE_AT_MS_MAX) return false;
  const time = new Date(ms).getTime();
  return Number.isFinite(time) && !Number.isNaN(time);
}
