// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { copyToClipboard, formatNumber, formatRelativeTime } from "@/lib/utils";

describe("formatRelativeTime", () => {
  it.each([
    [-60, "刚刚"],
    [0, "刚刚"],
    [59, "刚刚"],
    [60, "1分钟前"],
    [3599, "59分钟前"],
    [3600, "1小时前"],
    [86399, "23小时前"],
    [86400, "1天前"],
    [259200, "3天前"],
    [8640000, "100天前"],
  ])("formats %s seconds ago as %s", (seconds, label) => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(formatRelativeTime(new Date(now - seconds * 1000).toISOString())).toBe(label);
    vi.restoreAllMocks();
  });
});

describe("formatNumber", () => {
  it("formats small numbers as-is", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1)).toBe("1");
    expect(formatNumber(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    expect(formatNumber(1000)).toBe("1K");
    expect(formatNumber(1500)).toBe("1.5K");
    expect(formatNumber(9999)).toBe("10K");
  });

  it("formats millions with M suffix", () => {
    expect(formatNumber(1_000_000)).toBe("1M");
    expect(formatNumber(2_500_000)).toBe("2.5M");
  });

  it("formats billions with B suffix", () => {
    expect(formatNumber(1_000_000_000)).toBe("1B");
    expect(formatNumber(7_800_000_000)).toBe("7.8B");
  });

  it("respects maximumFractionDigits: 1", () => {
    // 1,550 => 1.6K (rounds to 1 decimal)
    expect(formatNumber(1550)).toBe("1.6K");
    // 1,450 => 1.5K (rounds to 1 decimal, down)
    expect(formatNumber(1450)).toBe("1.5K");
  });

  it("formats negative numbers", () => {
    expect(formatNumber(-1000)).toBe("-1K");
    expect(formatNumber(-2_500_000)).toBe("-2.5M");
  });
});

describe("copyToClipboard", () => {
  it("returns true on success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const result = await copyToClipboard("hello");

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("returns false when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const result = await copyToClipboard("secret");

    expect(result).toBe(false);
    expect(writeText).toHaveBeenCalledWith("secret");
  });

  it("handles empty string", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const result = await copyToClipboard("");

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith("");
  });

  it("handles long text", async () => {
    const longText = "a".repeat(10_000);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const result = await copyToClipboard(longText);

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith(longText);
  });
});
