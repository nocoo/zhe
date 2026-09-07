// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { applyStoredTheme, THEME_INIT_SCRIPT } from "@/lib/theme-init";

describe("applyStoredTheme", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    delete document.documentElement.dataset.mode;
  });

  it("applies stored dark theme to the document root", () => {
    localStorage.setItem("theme", "dark");
    applyStoredTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.dataset.mode).toBe("dark");
  });

  it("applies stored light theme to the document root", () => {
    localStorage.setItem("theme", "light");
    applyStoredTheme();
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.mode).toBe("light");
  });

  it("keeps the inline script in sync with applyStoredTheme", () => {
    expect(THEME_INIT_SCRIPT).toContain('localStorage.getItem("theme")');
    expect(THEME_INIT_SCRIPT).toContain('classList.toggle("dark"');
    expect(THEME_INIT_SCRIPT).toContain("dataset.mode");
  });
});
