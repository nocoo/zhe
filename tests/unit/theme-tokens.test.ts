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

  it("uses ink on a lifted purple in dark mode, not the raw 63% swatch", () => {
    const darkBlock = css.split(".dark {")[1]?.split("@utility")[0] ?? "";
    expect(darkBlock).toContain("--basalt-primary: 262 83% 74%");
    expect(darkBlock).toContain("--basalt-primary-foreground: 0 0% 4%");
    expect(darkBlock).toContain("--basalt-ring: 262 83% 74%");
    expect(darkBlock).not.toMatch(/--basalt-primary:\s*262 83% 63%/);
  });

  it("keeps CSS as the runtime source of truth for Zhe primary", () => {
    const src = readFileSync(resolve(process.cwd(), "components/basalt-providers.tsx"), "utf8");
    expect(src).toContain("applyToDocument={false}");
  });
});
