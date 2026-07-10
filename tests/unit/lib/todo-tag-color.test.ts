import { describe, expect, it } from "vitest";
import { __fnv1aForTests, todoTagColor } from "@/lib/todo-tag-color";

describe("todoTagColor", () => {
  it("returns a triple with hsl backgrounds/foregrounds/borders", () => {
    const c = todoTagColor("work");
    expect(c.bg).toMatch(/^hsl\(\d{1,3} 60% 92%\)$/);
    expect(c.fg).toMatch(/^hsl\(\d{1,3} 45% 25%\)$/);
    expect(c.border).toMatch(/^hsl\(\d{1,3} 55% 70%\)$/);
  });

  it("is deterministic for the same input", () => {
    const first = todoTagColor("home");
    const second = todoTagColor("home");
    expect(second).toEqual(first);
  });

  it("normalises case and surrounding whitespace so same-name tags collide", () => {
    const canonical = todoTagColor("urgent");
    expect(todoTagColor("Urgent")).toEqual(canonical);
    expect(todoTagColor("URGENT")).toEqual(canonical);
    expect(todoTagColor("  urgent  ")).toEqual(canonical);
  });

  it("distinct tags typically get distinct hues", () => {
    // Not a hard invariant of FNV-1a mod 360, but the smoke check catches an
    // accidental switch to a hash that maps large classes of names to a
    // single hue (e.g. a broken multiplier constant).
    const hues = new Set<string>();
    for (const name of ["work", "home", "reading", "shopping", "reply", "urgent", "later"]) {
      hues.add(todoTagColor(name).bg);
    }
    expect(hues.size).toBeGreaterThan(5);
  });

  it("empty and whitespace-only names still produce a valid triple", () => {
    const blank = todoTagColor("");
    expect(blank.bg).toMatch(/^hsl\(/);
    expect(todoTagColor("   ")).toEqual(blank);
  });
});

describe("fnv1a (implementation detail)", () => {
  it("matches known-vector `foobar` (RFC-ish reference: 0xbf9cf968)", () => {
    // The exact hash is not load-bearing but must be stable; if someone
    // swaps in a different hash function, existing users' tag colours
    // would all shuffle. This test guards against that.
    expect(__fnv1aForTests("foobar")).toBe(0xbf9c_f968);
  });

  it("empty string hashes to the FNV offset basis", () => {
    expect(__fnv1aForTests("")).toBe(0x811c_9dc5);
  });
});
