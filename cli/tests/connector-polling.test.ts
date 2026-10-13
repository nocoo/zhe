import { afterEach, expect, it, vi } from "vitest";
import { idlePollDelay } from "../src/connector/polling.js";

afterEach(() => vi.useRealTimers());

it.each([
  [0, 0, 30],
  [4, 59, 30],
  [5, 0, 5],
  [12, 0, 5],
  [21, 59, 5],
  [22, 0, 30],
  [23, 59, 30],
])("uses local time at %i:%i for a %i-minute idle delay", (hour, minute, minutes) => {
  const local = new Date(2026, 9, 13, hour, minute);
  expect(idlePollDelay(local)).toBe(minutes * 60_000);
  vi.useFakeTimers();
  vi.setSystemTime(local);
  expect(idlePollDelay()).toBe(minutes * 60_000);
});
