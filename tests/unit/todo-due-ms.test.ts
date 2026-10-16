// @vitest-environment node

import { describe, expect, it } from "vitest";
import { DUE_AT_MS_MAX, DUE_AT_MS_MIN, isValidDueAtMs } from "@/lib/todo-due-ms";

const YEAR_1_UTC = new Date("0001-01-01T00:00:00.000Z").getTime();
const YEAR_100_UTC = new Date("0100-01-01T00:00:00.000Z").getTime();
const DEC_31_1900_UTC = new Date("1900-12-31T00:00:00.000Z").getTime();

describe("isValidDueAtMs", () => {
  it("uses a true UTC year-1 floor (not Date.UTC(1) → 1901)", () => {
    expect(DUE_AT_MS_MIN).toBe(YEAR_1_UTC);
    expect(DUE_AT_MS_MIN).not.toBe(Date.UTC(1, 0, 1));
  });

  it("accepts in-range timestamps", () => {
    expect(isValidDueAtMs(DUE_AT_MS_MIN)).toBe(true);
    expect(isValidDueAtMs(YEAR_100_UTC)).toBe(true);
    expect(isValidDueAtMs(DEC_31_1900_UTC)).toBe(true);
    expect(isValidDueAtMs(DUE_AT_MS_MAX)).toBe(true);
    expect(isValidDueAtMs(1_700_000_000_000)).toBe(true);
  });

  it("rejects out-of-range and invalid Date values", () => {
    expect(isValidDueAtMs(9_000_000_000_000_000)).toBe(false);
    expect(isValidDueAtMs(DUE_AT_MS_MIN - 1)).toBe(false);
    expect(isValidDueAtMs(DUE_AT_MS_MAX + 1)).toBe(false);
    expect(isValidDueAtMs(Number.NaN)).toBe(false);
    expect(isValidDueAtMs(new Date("invalid").getTime())).toBe(false);
  });
});
