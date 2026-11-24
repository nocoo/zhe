import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  esbuild: {
    target: "esnext",
    legalComments: "none",
  },
  test: {
    allowOnly: false,
    passWithNoTests: false,
    environment: "node",
    globals: true,
    pool: "vmThreads",
    maxWorkers: 4,
    isolate: true,
    setupFiles: ["./tests/basalt-theme-mock.ts", "./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/playwright/**", "node_modules/**"],
    // Increase default timeout for L2 API E2E tests which hit real HTTP endpoints
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      // AST-aware remapping is built into vitest v4+; no opt-in needed.
      reporter: ["text", "json", "html"],
      skipFull: true,
      include: [
        "lib/**/*.ts",
        "models/links.ts",
        "models/search.ts",
        "models/backy.ts",
        "models/ai-*.ts",
        "actions/**/*.ts",
        "proxy.ts",
        "viewmodels/**/*.ts",
        "hooks/**/*.tsx",
      ],
      exclude: [
        // Third-party dependencies — never instrumented.
        "node_modules/",
        // Test files themselves are not production code.
        "tests/",
        // Build/tooling configuration files.
        "**/*.config.*",
        // Ambient type declarations contain no executable code.
        "**/*.d.ts",
        // Next.js build output directory.
        ".next/",
        // Config/schema/type-only files
        "lib/db/schema.ts",
        // Thin wrappers
        "app/api/auth/**",
        // View/page components (presentation only)
        "app/**/page.tsx",
        "app/**/layout.tsx",
        // Presentation View components — covered by L4 Playwright E2E
        "components/**",
        // Editor viewmodel — tested via E2E
        "viewmodels/useIdeaEditorViewModel.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
