import { expect, it } from "vitest";
import { canSwitch, initialMode } from "@/scripts/lib/environment-mode";

it("locks launch intent independently from manual E2E mode and ignores automated preferences", () => {
  expect(initialMode("automation", "prod", "demo")).toBe("e2e");
  expect(initialMode("interactive", "e2e", "prod")).toBe("e2e");
  expect(initialMode("interactive", undefined, "e2e")).toBe("e2e");
  expect(initialMode("interactive", undefined, "invalid")).toBe("demo");
  expect(canSwitch("interactive", "manual-e2e", "manual-e2e")).toBe(true);
  expect(canSwitch("automation", "run", "run")).toBe(false);
  expect(canSwitch("interactive", "new", "expired")).toBe(false);
});
