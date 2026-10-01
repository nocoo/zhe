import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("ships the production compatibility contract with the local stack", () => {
  const stack = readFileSync(resolve("scripts/test-stack.ts"), "utf8");
  const production = readFileSync(resolve("worker/wrangler.toml.example"), "utf8");
  const local = readFileSync(resolve("worker/wrangler.local.toml"), "utf8");
  expect(stack).toContain('"worker/wrangler.toml.example"');
  expect(stack).not.toContain('"worker/wrangler.toml"');
  for (const key of ["compatibility_date", "compatibility_flags"]) {
    const pattern = new RegExp(`^${key}\\s*=\\s*("[^"\\n]*"|\\[[\\s\\S]*?\\])`, "m");
    expect(local.match(pattern)?.[1]).toBe(production.match(pattern)?.[1]);
  }
});

it("includes all runtime script imports in the Docker build context", () => {
  const rules = readFileSync(resolve(".dockerignore"), "utf8").split("\n");
  expect(rules).not.toContain("scripts");
  expect(rules).toContain("!scripts/lib");
  for (const source of [
    "app/layout.tsx",
    "viewmodels/useEnvironmentViewModel.ts",
    "instrumentation.ts",
  ]) {
    const content = readFileSync(resolve(source), "utf8");
    const imports = [...content.matchAll(/["'](?:@\/|\.\/)scripts\/lib\/([^"']+)["']/g)];
    expect(imports.length).toBeGreaterThan(0);
    for (const [, name] of imports) expect(rules).toContain(`!scripts/lib/${name}.ts`);
  }
});
