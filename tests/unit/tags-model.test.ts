// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getTagStyles,
  isDuplicateTagName,
  isValidTagColor,
  randomTagColor,
  resolveTagColor,
  TAG_PALETTE,
  tagColorFromName,
  tagColorToken,
  validateTagName,
} from "@/models/tags";

describe("models/tags", () => {
  describe("TAG_PALETTE", () => {
    it("contains 12 colors matching defined --chart-N tokens", () => {
      expect(TAG_PALETTE).toHaveLength(12);
    });

    it("includes expected semantic color names", () => {
      expect(TAG_PALETTE).toContain("primary");
      expect(TAG_PALETTE).toContain("red");
      expect(TAG_PALETTE).toContain("green");
      expect(TAG_PALETTE).toContain("sky");
      expect(TAG_PALETTE).toContain("magenta");
    });

    it("does not include retired names that mapped to missing CSS vars", () => {
      expect(TAG_PALETTE).not.toContain("gray");
      expect(TAG_PALETTE).not.toContain("cobalt");
      expect(TAG_PALETTE).not.toContain("orchid");
    });

    it("contains only lowercase alphabetic strings", () => {
      for (const color of TAG_PALETTE) {
        expect(color).toMatch(/^[a-z]+$/);
      }
    });

    it("has no duplicates", () => {
      expect(new Set(TAG_PALETTE).size).toBe(TAG_PALETTE.length);
    });
  });

  describe("isValidTagColor", () => {
    it("returns true for valid palette colors", () => {
      expect(isValidTagColor("primary")).toBe(true);
      expect(isValidTagColor("red")).toBe(true);
      expect(isValidTagColor("magenta")).toBe(true);
      expect(isValidTagColor("sky")).toBe(true);
    });

    it("returns false for unknown colors", () => {
      expect(isValidTagColor("slate")).toBe(false);
      expect(isValidTagColor("blue")).toBe(false);
      expect(isValidTagColor("")).toBe(false);
      expect(isValidTagColor("#ff0000")).toBe(false);
    });
  });

  describe("randomTagColor", () => {
    it("returns a valid palette color", () => {
      const color = randomTagColor();
      expect(isValidTagColor(color)).toBe(true);
    });

    it("returns colors from the TAG_PALETTE array", () => {
      for (let i = 0; i < 30; i++) {
        expect(TAG_PALETTE).toContain(randomTagColor());
      }
    });
  });

  describe("tagColorFromName", () => {
    it("returns a valid palette color", () => {
      expect(isValidTagColor(tagColorFromName("work"))).toBe(true);
      expect(isValidTagColor(tagColorFromName("personal"))).toBe(true);
    });

    it("is deterministic — same name always gives same color", () => {
      const color1 = tagColorFromName("work");
      const color2 = tagColorFromName("work");
      const color3 = tagColorFromName("work");
      expect(color1).toBe(color2);
      expect(color2).toBe(color3);
    });

    it("handles Chinese characters deterministically", () => {
      const color = tagColorFromName("工作");
      expect(isValidTagColor(color)).toBe(true);
      expect(tagColorFromName("工作")).toBe(color);
    });

    it("handles emoji", () => {
      const color = tagColorFromName("🚀 launch");
      expect(isValidTagColor(color)).toBe(true);
      expect(tagColorFromName("🚀 launch")).toBe(color);
    });

    it("distributes across multiple colors for varied inputs", () => {
      const names = [
        "alpha",
        "beta",
        "gamma",
        "delta",
        "epsilon",
        "zeta",
        "eta",
        "theta",
        "iota",
        "kappa",
        "lambda",
        "mu",
        "nu",
        "xi",
        "omicron",
        "pi",
        "工作",
        "学习",
        "旅行",
        "购物",
        "健康",
        "娱乐",
        "阅读",
        "运动",
      ];
      const colors = new Set(names.map(tagColorFromName));
      // With 24 diverse names across 12 slots, we should see good distribution
      expect(colors.size).toBeGreaterThanOrEqual(8);
    });

    it("handles single-char names", () => {
      expect(isValidTagColor(tagColorFromName("a"))).toBe(true);
      expect(isValidTagColor(tagColorFromName("Z"))).toBe(true);
    });

    it("handles empty string without throwing", () => {
      // Empty string should still produce a valid color
      expect(isValidTagColor(tagColorFromName(""))).toBe(true);
    });
  });

  describe("tagColorToken", () => {
    it("returns a chart-N token string", () => {
      const token = tagColorToken("work");
      expect(token).toMatch(/^chart-\d+$/);
    });

    it("returns token in range chart-1 to chart-12", () => {
      const names = ["work", "personal", "工作", "🚀", "x", "orchid", "gray", "cobalt"];
      for (const name of names) {
        const token = tagColorToken(name);
        const num = parseInt(token.replace("chart-", ""), 10);
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(12);
      }
    });

    it("never emits an undefined chart token for any hashed name", () => {
      for (let i = 0; i < 200; i++) {
        const token = tagColorToken(`probe-${i}`);
        const num = Number.parseInt(token.replace("chart-", ""), 10);
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(12);
      }
    });

    it("uses stored palette color instead of the name hash", () => {
      const hashed = tagColorToken("work");
      const stored = tagColorToken("work", "red");
      expect(stored).toBe("chart-10");
      expect(tagColorToken("anything", "red")).toBe("chart-10");
      // stored color can differ from the name-derived default
      if (hashed !== "chart-10") {
        expect(stored).not.toBe(hashed);
      }
    });

    it("falls back to the name hash when stored color is invalid", () => {
      expect(tagColorToken("work", "cobalt")).toBe(tagColorToken("work"));
      expect(tagColorToken("work", "#ffffff")).toBe(tagColorToken("work"));
    });

    it("is deterministic — same name always gives same token", () => {
      expect(tagColorToken("design")).toBe(tagColorToken("design"));
      expect(tagColorToken("设计")).toBe(tagColorToken("设计"));
    });
  });

  describe("validateTagName", () => {
    it("returns trimmed name for valid input", () => {
      expect(validateTagName("work")).toBe("work");
      expect(validateTagName("  spaced  ")).toBe("spaced");
    });

    it("returns null for empty or whitespace-only input", () => {
      expect(validateTagName("")).toBeNull();
      expect(validateTagName("   ")).toBeNull();
    });

    it("returns null for names exceeding 30 characters", () => {
      const longName = "a".repeat(31);
      expect(validateTagName(longName)).toBeNull();
    });

    it("accepts names exactly 30 characters", () => {
      const name = "a".repeat(30);
      expect(validateTagName(name)).toBe(name);
    });

    it("preserves unicode characters", () => {
      expect(validateTagName("工作")).toBe("工作");
      expect(validateTagName("プロジェクト")).toBe("プロジェクト");
    });
  });

  describe("getTagStyles", () => {
    it("returns badge and dot style objects", () => {
      const styles = getTagStyles("work");
      expect(styles.badge).toHaveProperty("backgroundColor");
      expect(styles.badge).toHaveProperty("color");
      expect(styles.dot).toHaveProperty("backgroundColor");
    });

    it("uses CSS variable references in style values", () => {
      const styles = getTagStyles("work");
      expect(styles.badge.backgroundColor).toMatch(/^hsl\(var\(--chart-\d+\)/);
      expect(styles.badge.color).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
      expect(styles.dot.backgroundColor).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
    });

    it("returns consistent styles for same name", () => {
      const a = getTagStyles("test");
      const b = getTagStyles("test");
      expect(a.badge.backgroundColor).toBe(b.badge.backgroundColor);
      expect(a.badge.color).toBe(b.badge.color);
      expect(a.dot.backgroundColor).toBe(b.dot.backgroundColor);
    });

    it("handles Chinese tag names", () => {
      const styles = getTagStyles("工作");
      expect(styles.badge.backgroundColor).toMatch(/^hsl\(var\(--chart-\d+\)/);
    });

    it("badge background has alpha channel, dot does not", () => {
      const styles = getTagStyles("design");
      // Badge bg uses / 0.12 for translucency
      expect(styles.badge.backgroundColor).toContain("/ 0.12");
      // Dot is solid color — no alpha
      expect(styles.dot.backgroundColor).not.toContain("/");
    });

    it("honours a stored palette color", () => {
      const styles = getTagStyles("work", "red");
      expect(styles.badge.color).toBe("hsl(var(--chart-10))");
    });

    it("ignores retired / hex stored colors so badges stay on defined tokens", () => {
      const fallback = getTagStyles("work");
      expect(getTagStyles("work", "gray")).toEqual(fallback);
      expect(getTagStyles("work", "#ffffff")).toEqual(fallback);
    });
  });

  describe("resolveTagColor", () => {
    it("returns the stored color when it is in the palette", () => {
      expect(resolveTagColor("work", "amber")).toBe("amber");
    });

    it("falls back to the name hash for missing or invalid color", () => {
      expect(resolveTagColor("work")).toBe(tagColorFromName("work"));
      expect(resolveTagColor("work", "cobalt")).toBe(tagColorFromName("work"));
      expect(resolveTagColor("work", null)).toBe(tagColorFromName("work"));
    });
  });

  describe("isDuplicateTagName", () => {
    const tags = [
      { id: "1", name: "Work" },
      { id: "2", name: "home" },
    ];

    it("detects case-insensitive duplicates", () => {
      expect(isDuplicateTagName("work", tags)).toBe(true);
      expect(isDuplicateTagName("  HOME  ", tags)).toBe(true);
    });

    it("allows a rename that keeps its own name", () => {
      expect(isDuplicateTagName("Work", tags, "1")).toBe(false);
    });

    it("returns false for a new unique name or empty input", () => {
      expect(isDuplicateTagName("personal", tags)).toBe(false);
      expect(isDuplicateTagName("   ", tags)).toBe(false);
    });
  });
});
