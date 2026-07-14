/**
 * Chip-status derivation for the optional `dueAt` on a todo.
 *
 * `dueAt` is v1 date-only: the client stores the picked date's local
 * end-of-day converted to UTC (see docs/21-todos-feature.md — "Due Date").
 * Callers compute the status at read time from the stored timestamp, the
 * todo's `done` flag, and "now" (usually `new Date()`). The returned
 * `DueStatus` drives the chip's colour/emphasis and the human label.
 */

export type DueStatus =
  | { kind: "no-due" }
  | { kind: "overdue"; label: string }
  | { kind: "today"; label: string }
  | { kind: "tomorrow"; label: string }
  | { kind: "soon"; label: string }
  | { kind: "later"; label: string }
  | { kind: "done-with-due"; label: string };

const SOON_WINDOW_DAYS = 7;

/**
 * Return the display status for a todo's due date.
 *
 * @param now      Reference "now" (dependency-injected for testability).
 * @param dueAt    The stored `dueAt` timestamp; `null` means no due date set.
 * @param done     Whether the todo has been marked complete.
 */
export function dueStatus(now: Date, dueAt: Date | null, done: boolean): DueStatus {
  if (dueAt === null) return { kind: "no-due" };

  // All day-window boundaries are computed as **local calendar days**, not
  // 24h-ms offsets, so DST transitions (spring-forward / fall-back) do not
  // shift the "today" / "tomorrow" boundary. See tests for the two failing
  // vectors that motivated this: 2026-03-08 (NY spring-forward) and
  // 2026-11-01 (NY fall-back).
  const startToday = startOfDay(now);
  const startTomorrow = addCalendarDays(startToday, 1);
  const startDayAfter = addCalendarDays(startToday, 2);
  const soonBoundary = addCalendarDays(startToday, SOON_WINDOW_DAYS);

  // A done todo never shouts. Show the historical date with low emphasis,
  // regardless of whether it was met or missed — the user has moved on.
  if (done) {
    return { kind: "done-with-due", label: `原定 ${formatDate(dueAt, now)}` };
  }

  // Overdue: strictly before the *start* of today in local time. Using
  // start-of-day (not `now`) is what keeps a todo "due today" from flipping
  // to Overdue as soon as the local clock ticks past its stored UTC instant.
  if (dueAt.getTime() < startToday.getTime()) {
    return { kind: "overdue", label: `逾期 · ${formatDate(dueAt, now)}` };
  }

  if (dueAt.getTime() < startTomorrow.getTime()) {
    return { kind: "today", label: "今日" };
  }

  if (dueAt.getTime() < startDayAfter.getTime()) {
    return { kind: "tomorrow", label: "明日" };
  }

  if (dueAt.getTime() < soonBoundary.getTime()) {
    return { kind: "soon", label: formatDate(dueAt, now) };
  }

  return { kind: "later", label: formatDate(dueAt, now) };
}

/**
 * Local midnight for the given date, using the host timezone. Both DST edges
 * are handled correctly because we ask Date for its year/month/day (locale
 * fields) and then construct a fresh Date via the local-time constructor.
 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Add `days` calendar days in the host timezone. Uses the local-time Date
 * constructor so a DST transition mid-window still lands on the correct
 * next local midnight (Date normalises out-of-range `day` values into the
 * next month/year as needed).
 */
function addCalendarDays(start: Date, days: number): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + days, 0, 0, 0, 0);
}

/**
 * Short human date in zh-CN — "7月15日" for same-year; falls back to
 * "2027年1月5日" when the target year differs from `reference` so a
 * forward-planned or stale chip remains unambiguous.
 */
function formatDate(target: Date, reference: Date): string {
  const options: Intl.DateTimeFormatOptions =
    target.getFullYear() === reference.getFullYear()
      ? { month: "long", day: "numeric" }
      : { month: "long", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat("zh-CN", options).format(target);
}
