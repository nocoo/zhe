import { describe, expect, it } from "vitest";
import { dueStatus } from "@/lib/todo-due";

/**
 * Tests deliberately use "local" dates constructed via `new Date(y, m, d, ...)`
 * so start-of-day comparisons behave the same on every developer's machine.
 * The chip status contract is defined against the host timezone (see
 * docs/21-todos-feature.md — "Due Date"), so anchoring to local time is
 * exactly what the production code does.
 */

const local = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) =>
  new Date(y, m - 1, d, h, mi, s, 0);

/** Local end-of-day, matching how the client encodes a date-only pick. */
const localEndOfDay = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 23, 59, 59, 999);

describe("dueStatus", () => {
  const now = local(2026, 7, 10, 10, 30); // 2026-07-10 10:30 local

  it("no-due when dueAt is null", () => {
    expect(dueStatus(now, null, false)).toEqual({ kind: "no-due" });
    expect(dueStatus(now, null, true)).toEqual({ kind: "no-due" });
  });

  it("overdue when dueAt was strictly before start-of-today", () => {
    const yesterdayEOD = localEndOfDay(2026, 7, 9);
    const status = dueStatus(now, yesterdayEOD, false);
    expect(status.kind).toBe("overdue");
    if (status.kind === "overdue") {
      expect(status.label).toMatch(/^Overdue · Jul 9$/);
    }
  });

  it("today when dueAt lands anywhere within today's local window", () => {
    // Anchored at end-of-day (client's date-only encoding). We are past
    // "now" but before start-of-tomorrow, so status must be `today`.
    const status = dueStatus(now, localEndOfDay(2026, 7, 10), false);
    expect(status).toEqual({ kind: "today", label: "Today" });
  });

  it("today even when dueAt hour is earlier than `now` (date-only invariant)", () => {
    // Regression for the round-2 finding: a specific 09:00 dueAt should not
    // flip to Overdue at 10:00. Overdue uses start-of-day, so any dueAt
    // within [startOfToday, startOfTomorrow) is `today`.
    const earlierToday = local(2026, 7, 10, 9, 0);
    expect(dueStatus(now, earlierToday, false).kind).toBe("today");
  });

  it("tomorrow when dueAt falls in the next local calendar day", () => {
    const status = dueStatus(now, localEndOfDay(2026, 7, 11), false);
    expect(status).toEqual({ kind: "tomorrow", label: "Tomorrow" });
  });

  it("soon within the 7-day window (exclusive of tomorrow)", () => {
    const status = dueStatus(now, localEndOfDay(2026, 7, 15), false);
    expect(status.kind).toBe("soon");
    if (status.kind === "soon") {
      expect(status.label).toBe("Jul 15");
    }
  });

  it("later beyond the 7-day window", () => {
    const status = dueStatus(now, localEndOfDay(2026, 8, 3), false);
    expect(status.kind).toBe("later");
    if (status.kind === "later") {
      expect(status.label).toBe("Aug 3");
    }
  });

  it("done-with-due shows the historical date without the overdue emphasis", () => {
    const status = dueStatus(now, localEndOfDay(2026, 7, 8), true);
    expect(status.kind).toBe("done-with-due");
    if (status.kind === "done-with-due") {
      expect(status.label).toBe("Was due Jul 8");
    }
  });

  it("done-with-due even when the due date is in the future", () => {
    const status = dueStatus(now, localEndOfDay(2026, 7, 30), true);
    expect(status.kind).toBe("done-with-due");
  });

  it("formatDate drops the year for same-year targets", () => {
    const sameYear = dueStatus(now, localEndOfDay(2026, 12, 24), false);
    if (sameYear.kind === "later") {
      expect(sameYear.label).toBe("Dec 24");
    } else {
      throw new Error("expected later");
    }
  });

  it("formatDate keeps the year when target crosses the year boundary", () => {
    const nextYear = dueStatus(now, localEndOfDay(2027, 1, 5), false);
    if (nextYear.kind === "later") {
      expect(nextYear.label).toBe("Jan 5, 2027");
    } else {
      throw new Error("expected later");
    }
  });

  it("start-of-day boundary: dueAt exactly at start-of-tomorrow is `tomorrow`, not `today`", () => {
    const startOfTomorrow = local(2026, 7, 11, 0, 0, 0);
    expect(dueStatus(now, startOfTomorrow, false).kind).toBe("tomorrow");
  });

  it("start-of-day boundary: dueAt one ms before start-of-today is `overdue`", () => {
    const oneMsBeforeMidnight = new Date(local(2026, 7, 10, 0, 0, 0).getTime() - 1);
    expect(dueStatus(now, oneMsBeforeMidnight, false).kind).toBe("overdue");
  });
});

/**
 * DST regression tests. These fail under a 24h-ms `MS_PER_DAY` day-window
 * calculation (the pre-fix v1 implementation) whenever "today" crosses a
 * DST transition. Concrete NY vectors:
 *   - 2026-03-08 (spring-forward): startToday + 24h = 3/9 01:00, so 3/9 00:00
 *     is wrongly classified as still "today".
 *   - 2026-11-01 (fall-back): startToday + 24h = 11/1 23:00, so 11/1 23:30
 *     is wrongly classified as "tomorrow".
 *
 * The fix (calendar-day arithmetic via `new Date(y, m, d + n, 0, 0, 0)`)
 * puts the window boundaries on the correct local midnights.
 *
 * Vitest's vm thread pool does NOT honour mid-process `process.env.TZ`
 * mutations (verified — `new Date(2026, 2, 8, 10)` still resolves in the
 * host's TZ inside a test even after `process.env.TZ = "America/New_York"`
 * in beforeAll). So we spawn a `bun` subprocess with `TZ` set at process
 * start, which is the only reliable way to test Date-local behaviour in
 * another timezone across CI machines that are not in NY.
 */
describe("dueStatus — DST (America/New_York, subprocess)", () => {
  it("spring-forward, fall-back, and 7-day soon-window boundaries hold", async () => {
    const { spawnSync } = await import("node:child_process");
    const path = await import("node:path");
    const scriptPath = path.resolve(
      __dirname,
      "../../../scripts/todo-due-dst-vectors.ts",
    );
    const result = spawnSync("bun", ["run", scriptPath], {
      env: { ...process.env, TZ: "America/New_York" },
      encoding: "utf8",
    });
    // stderr surfaces on failure; include it for diagnostics.
    expect(result.status, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`).toBe(0);
    const vectors = JSON.parse(result.stdout) as Array<{
      name: string;
      want: string;
      got: string;
    }>;
    for (const v of vectors) {
      expect(v.got, `${v.name}: expected ${v.want}, got ${v.got}`).toBe(v.want);
    }
  });
});
