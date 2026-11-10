import { describe, expect, it } from "vitest";
import { parseNonNegativeInt } from "../src/utils.js";

describe("parseNonNegativeInt", () => {
  it("accepts zero and positive integers", () => {
    expect(parseNonNegativeInt("0")).toBe(0);
    expect(parseNonNegativeInt("42")).toBe(42);
  });

  it("rejects integers above the safe range", () => {
    expect(parseNonNegativeInt(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
  });

  it("rejects partial parses", () => {
    expect(parseNonNegativeInt("1.5")).toBeNull();
    expect(parseNonNegativeInt("1foreign")).toBeNull();
    expect(parseNonNegativeInt("1e3")).toBeNull();
    expect(parseNonNegativeInt("01")).toBeNull();
  });
});
