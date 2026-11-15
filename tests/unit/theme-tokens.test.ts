import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("theme tokens", () => {
  it("declares color-scheme for light and dark html modes", () => {
    expect(css).toMatch(
      /html\.light,\s*\n\s*html\[data-mode="light"\] \{\s*\n\s*color-scheme:\s*light;/,
    );
    expect(css).toMatch(
      /html\.dark,\s*\n\s*html\[data-mode="dark"\] \{\s*\n\s*color-scheme:\s*dark;/,
    );
  });

  it("keeps Zhe purple in the supported Basalt accent provider", () => {
    const src = readFileSync(resolve(process.cwd(), "components/basalt-providers.tsx"), "utf8");
    expect(src).toContain('primary: { light: "262 83% 58%", dark: "262 83% 63%" }');
    expect(src).toContain("paletteOverrides={ZHE_ACCENT}");
  });

  it("does not redeclare Basalt primary or ring tokens in app CSS", () => {
    expect(css).not.toContain("--basalt-primary:");
    expect(css).not.toContain("--basalt-primary-foreground:");
    expect(css).not.toContain("--basalt-ring:");
  });
});
