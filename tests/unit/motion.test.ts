import { describe, expect, it } from "vitest";
import { staggerStyle } from "@/lib/motion";

describe("staggerStyle", () => {
  it("delays by motion-stagger times the index", () => {
    expect(staggerStyle(3).animationDelay).toBe("calc(var(--motion-stagger) * 3)");
  });

  it("caps delay so long lists do not stall", () => {
    expect(staggerStyle(40).animationDelay).toBe("calc(var(--motion-stagger) * 12)");
  });
});
