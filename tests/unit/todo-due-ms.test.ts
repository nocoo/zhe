// @vitest-environment node

import { describe, expect, it } from "vitest";
import { DUE_AT_MS_MAX, DUE_AT_MS_MIN, isValidDueAtMs } from "@/lib/todo-due-ms";

describe("isValidDueAtMs", () => {
  it("accepts in-range timestamps", () => {
    expect(isValidDueAtMs(DUE_AT_MS_MIN)).toBe(true);
    expect(isValidDueAtMs(DUE_AT_MS_MAX)).toBe(true);
    expect(isValidDueAtMs(1_700_000_000_000)).toBe(true);
  });

  it("rejects out-of-range and invalid Date values", () => {
    expect(isValidDueAtMs(9_000_000_000_000_000)).toBe(false);
    expect(isValidDueAtMs(DUE_AT_MS_MIN - 1)).toBe(false);
    expect(isValidDueAtMs(DUE_AT_MS_MAX + 1)).toBe(false);
    expect(isValidDueAtMs(Number.NaN)).toBe(false);
  });
});
