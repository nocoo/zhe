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

  it("uses AccentProvider semantic dark primary, not the raw 63% swatch", () => {
    const darkBlock = css.split(".dark {")[1]?.split("@utility")[0] ?? "";
    expect(darkBlock).toContain("--basalt-primary: 262 83% 71%");
    expect(darkBlock).toContain("--basalt-primary-foreground: 0 0% 10%");
    expect(darkBlock).toContain("--basalt-ring: 262 83% 71%");
    expect(darkBlock).not.toMatch(/--basalt-primary:\s*262 83% 63%/);
  });
});
