import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";

describe("THEME_INIT_SCRIPT", () => {
  it("reads the theme storage key and sets light/dark classes", () => {
    expect(THEME_INIT_SCRIPT).toContain('localStorage.getItem("theme")');
    expect(THEME_INIT_SCRIPT).toContain('classList.toggle("dark"');
    expect(THEME_INIT_SCRIPT).toContain('classList.toggle("light"');
    expect(THEME_INIT_SCRIPT).toContain("dataset.mode");
  });
});
