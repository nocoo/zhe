/**
 * Parse `zhe todo create|update --due`.
 *
 * Accepted formats (entire string must match one):
 * - Unix epoch milliseconds: non-empty decimal digits only (e.g. `1700000000000`)
 * - Calendar date: `YYYY-MM-DD` (validated components; rejects `2026-99-99`)
 */
const MS_ONLY = /^\d+$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseTodoDueArg(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  if (MS_ONLY.test(trimmed)) {
    // Require full millisecond timestamps (avoids `--due 2026` or `--due 0` misreads).
    if (trimmed.length < 12) return null;
    const ms = Number(trimmed);
    if (!Number.isSafeInteger(ms)) return null;
    return ms;
  }

  const dateMatch = DATE_ONLY.exec(trimmed);
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return utc.getTime();
}
