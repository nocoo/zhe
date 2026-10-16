import { describe, expect, it } from "vitest";
import { parseTodoDueArg } from "../src/commands/todo/parse-due.js";

describe("parseTodoDueArg", () => {
  it("accepts Unix milliseconds", () => {
    expect(parseTodoDueArg("1700000000000")).toBe(1_700_000_000_000);
  });

  it("accepts YYYY-MM-DD", () => {
    const ms = parseTodoDueArg("2026-04-15");
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("rejects invalid calendar dates", () => {
    expect(parseTodoDueArg("2026-99-99")).toBeNull();
    expect(parseTodoDueArg("2026-02-30")).toBeNull();
  });

  it("rejects short numeric strings that are not calendar dates", () => {
    expect(parseTodoDueArg("0")).toBeNull();
    expect(parseTodoDueArg("2026")).toBeNull();
    expect(parseTodoDueArg("12abc")).toBeNull();
  });

  it("rejects loose Date.parse strings", () => {
    expect(parseTodoDueArg("Apr 15, 2026")).toBeNull();
  });

  it("rejects out-of-range millisecond timestamps", () => {
    expect(parseTodoDueArg("9000000000000000")).toBeNull();
  });
});
