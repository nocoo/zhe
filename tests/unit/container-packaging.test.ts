import { readdirSync, readFileSync } from "node:fs";
import { dirname, matchesGlob, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(file), "utf8");
const dockerfile = source("Dockerfile");
const rules = source(".dockerignore").trim().split("\n");
const sourceDirectories = [
  "actions",
  "app",
  "components",
  "contexts",
  "hooks",
  "lib",
  "models",
  "viewmodels",
  "public",
];
const connectorFiles = ["core", "dns", "github-core", "screenshot-core", "sources", "types"];
const scriptFiles = ["environment-mode", "local-client-script", "provider-fixtures"];

const allowlist = [
  "package.json",
  "bun.lock",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "auth.ts",
  "proxy.ts",
  "instrumentation.ts",
  ...sourceDirectories.flatMap((directory) => [`${directory}/`, `${directory}/**`]),
  "cli/",
  "cli/src/",
  "cli/src/connector/",
  ...connectorFiles.map((name) => `cli/src/connector/${name}.ts`),
  "scripts/",
  "scripts/lib",
  ...scriptFiles.map((name) => `scripts/lib/${name}.ts`),
];

const directoryExclusions = [
  "cli/*",
  "cli/src/*",
  "cli/src/connector/*",
  "scripts/*",
  "scripts/lib/*",
];
const exclusions = [
  "**/.env*",
  "**/.dev.vars*",
  "**/*.pem",
  "**/*.key",
  "**/.npmrc",
  "**/.git",
  "**/node_modules",
  "**/.next",
  "**/.next-*",
  "**/*.tsbuildinfo",
  "**/.wrangler",
  "**/.demo-storage",
  "**/.test-storage",
  "**/.artifacts",
  "**/.connector",
  "**/.auth",
  "**/coverage",
  "**/dist",
  "**/playwright-report",
  "**/test-results",
  "**/*.test.*",
  "**/*.spec.*",
];

describe("production container packaging", () => {
  it("pins official Bun and shared Node 22 Debian images with a frozen install", () => {
    expect(dockerfile.match(/^FROM .*$/gm)).toEqual([
      "FROM oven/bun:1.3.11@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS bun",
      "FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS base",
      "FROM base AS deps",
      "FROM base AS builder",
      "FROM base AS runner",
    ]);
    expect(dockerfile).toContain("COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun");
    expect(dockerfile).toContain(
      "COPY package.json bun.lock ./\nRUN bun install --frozen-lockfile",
    );
    expect(dockerfile).toContain("COPY --from=deps /app/node_modules ./node_modules");
    expect(dockerfile).toContain("COPY . .");
    expect(dockerfile).toContain("RUN node node_modules/next/dist/bin/next build");
    expect(dockerfile).not.toMatch(
      /bun (?:run |--bun )?(?:next|build)|--(?:production|omit|ignore-scripts)/,
    );
  });

  it("has no build arguments, credentials or test-mode overrides", () => {
    expect(dockerfile).not.toMatch(/^ARG\s|--mount=type=secret|COPY[^\n]*\.env/gm);
    expect(dockerfile.match(/^ENV [^\n]*(?:\n[ \t]+[^\n]+)*/gm)).toEqual([
      "ENV NEXT_TELEMETRY_DISABLED=1",
      "ENV NEXT_WORKER_COUNT=2",
      "ENV NODE_OPTIONS=--max-old-space-size=2048",
      "ENV NODE_ENV=production \\\n    PORT=7006 \\\n    HOSTNAME=0.0.0.0",
    ]);
  });

  it("ships standalone assets with a writable owned Next cache and overridable port", () => {
    const runner = dockerfile.split("FROM base AS runner\n")[1] ?? "";
    for (const [input, output] of [
      [".next/standalone", "./"],
      [".next/static", "./.next/static"],
      ["public", "./public"],
    ]) {
      expect(runner).toContain(`COPY --from=builder --chown=node:node /app/${input} ${output}`);
    }
    expect(runner).toContain("RUN mkdir -p .next/cache && chown node:node .next/cache\nUSER node");
    expect(runner).toContain("RUN test -w .next/cache && node --unhandled-rejections=strict");
    expect(runner).toContain("PORT=7006");
    expect(runner).toContain("HOSTNAME=0.0.0.0");
    expect(runner).toContain("EXPOSE 7006");
    expect(runner.trim().endsWith('CMD ["node", "server.js"]')).toBe(true);
    expect(source("next.config.ts")).toMatch(/output:\s*"standalone"/);
  });

  it("exercises native Sharp with a real tiny PNG in the final stage as node", () => {
    const runner = dockerfile.split("FROM base AS runner\n")[1] ?? "";
    expect(runner).toMatch(
      /USER node\nRUN test -w \.next\/cache && node --unhandled-rejections=strict/,
    );
    expect(runner).toContain("require('sharp')({ create: { width: 1, height: 1, channels: 4,");
    expect(runner).toContain("}).png().toBuffer().then(() => console.log('Sharp ready'))");
  });

  it("allowlists only build inputs, then excludes nested secrets and host state", () => {
    expect(rules[0]).toBe("**");
    expect(rules.filter((rule) => rule.startsWith("!"))).toEqual(
      allowlist.map((file) => `!${file}`),
    );
    expect(rules.filter((rule) => !rule.startsWith("!"))).toEqual([
      "**",
      ...directoryExclusions,
      ...exclusions,
    ]);
    expect(rules.slice(-exclusions.length)).toEqual(exclusions);
    const included = (file: string) => {
      const parts = file.split("/");
      const parents = parts.map((_, index) => parts.slice(0, index + 1).join("/"));
      return rules.reduce((allowed, rule) => {
        const negated = rule.startsWith("!");
        const pattern = rule.replace(/^!/, "").replace(/\/$/, "");
        return parents.some((parent) => matchesGlob(parent, pattern)) ? negated : allowed;
      }, true);
    };
    for (const file of allowlist.filter((entry) => !entry.endsWith("/") && !entry.endsWith("/**")))
      expect(included(file), file).toBe(true);
    for (const file of [
      "app/layout.tsx",
      "public/logo-80.png",
      "lib/db/schema.ts",
      "components/ui/button.tsx",
    ])
      expect(included(file), file).toBe(true);
    for (const file of [
      ".env.local",
      "next-env.d.ts",
      "node_modules/next/package.json",
      ".next/standalone/server.js",
      ".next-local/cache/data",
      ".next-test/run/server.js",
      ".demo-storage/data.sqlite",
      ".test-storage/runs/data.sqlite",
      ".artifacts/build.log",
      ".git/config",
      ".npmrc",
      "worker/src/index.ts",
      "cli/package.json",
      "cli/node_modules/package/index.js",
      "cli/src/index.ts",
      "cli/src/connector/runtime.ts",
      "cli/src/connector/eagle-native.py",
      "scripts/release.ts",
      "scripts/lib/local-run.ts",
      "app/.env.production",
      "public/.dev.vars",
      "lib/nested/private.key",
      "public/nested/cert.pem",
      "lib/node_modules/package/index.js",
      "public/.test-storage/data",
      "lib/example.test.ts",
    ])
      expect(included(file), file).toBe(false);
    expect(allowlist).not.toContain("next-env.d.ts");
    const tsconfig = JSON.parse(source("tsconfig.json"));
    expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./*"]);
    expect(tsconfig.exclude).toEqual(expect.arrayContaining(["node_modules", "worker", "cli"]));
  });

  it("retains imported CLI/script modules and their transitive relative imports", () => {
    const files = [
      "auth.ts",
      "proxy.ts",
      "instrumentation.ts",
      ...sourceDirectories.flatMap((directory) =>
        readdirSync(directory, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
          .map((entry) => resolve(entry.parentPath, entry.name)),
      ),
      ...connectorFiles.map((name) => `cli/src/connector/${name}.ts`),
      ...scriptFiles.map((name) => `scripts/lib/${name}.ts`),
    ];
    for (const file of files) {
      for (const [, specifier = ""] of source(file).matchAll(
        /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g,
      )) {
        const imported = specifier.startsWith("@/")
          ? resolve(specifier.slice(2))
          : specifier.startsWith(".")
            ? resolve(dirname(resolve(file)), specifier)
            : "";
        for (const directory of ["cli", "scripts"]) {
          const prefix = `${resolve(directory)}/`;
          if (!imported.startsWith(prefix)) continue;
          const relative = `${directory}/${imported.slice(prefix.length)}`.replace(/\.[jt]s$/, "");
          expect(rules, `${file} imports ${specifier}`).toContain(`!${relative}.ts`);
          expect(() => source(`${relative}.ts`)).not.toThrow();
        }
      }
    }
  });
});
