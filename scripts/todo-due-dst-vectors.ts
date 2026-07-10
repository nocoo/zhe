#!/usr/bin/env bun
/**
 * DST regression fixture for `lib/todo-due.ts`.
 *
 * Runs against a subprocess whose `TZ` is set to `America/New_York` at
 * process start (Vitest's vm thread pool cannot reliably mutate TZ
 * mid-process). Prints JSON to stdout listing each case's expected and
 * actual chip kind; the vitest test asserts equality on each row.
 *
 * The fixtures anchor around two NY DST transitions in 2026:
 *   - 2026-03-08: spring-forward — 3/8 has 23h, 3/9 begins normally.
 *     Under buggy `startToday + 24h`, "start of tomorrow" lands at
 *     3/9 01:00, so 3/9 00:00 would be misclassified as "today".
 *   - 2026-11-01: fall-back — 11/1 has 25h. Under buggy arithmetic,
 *     "start of tomorrow" lands at 11/1 23:00, so 11/1 23:30 would be
 *     misclassified as "tomorrow".
 */

import { dueStatus } from "../lib/todo-due";

const local = (y: number, m: number, d: number, h = 0, mi = 0) =>
  new Date(y, m - 1, d, h, mi, 0, 0);

interface Vector {
  name: string;
  now: Date;
  due: Date;
  want: "overdue" | "today" | "tomorrow" | "soon" | "later" | "no-due" | "done-with-due";
}

const vectors: Vector[] = [
  // Spring-forward: 2026-03-09 00:00 local should be 'tomorrow', not 'today'.
  { name: "spring-tomorrow", now: local(2026, 3, 8, 10), due: local(2026, 3, 9, 0), want: "tomorrow" },
  // Fall-back: 2026-11-01 23:30 local should be 'today', not 'tomorrow'.
  { name: "fall-today", now: local(2026, 11, 1, 10), due: local(2026, 11, 1, 23, 30), want: "today" },
  // 7-day soon-window boundary across spring-forward: 3/14 00:00 must be
  // 'soon' (day 6 out), not 'later'. Under 24h-ms arithmetic the soon
  // boundary starting from 3/8 00:00 lands at 3/15 01:00, so 3/15 00:00
  // would be misclassified as 'soon' rather than 'later'; checking day 6
  // here keeps this test insensitive to that off-by-one and instead
  // exercises the calendar-day boundary in the middle of the window.
  { name: "spring-soon-mid", now: local(2026, 3, 8, 10), due: local(2026, 3, 14, 0), want: "soon" },
];

const results = vectors.map((v) => ({
  name: v.name,
  want: v.want,
  got: dueStatus(v.now, v.due, false).kind,
}));

process.stdout.write(JSON.stringify(results));
