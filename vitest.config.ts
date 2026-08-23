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
    environment: "node",
    globals: true,
    pool: "vmThreads",
    isolate: true,
    setupFiles: ["./tests/setup.ts"],
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
        "models/backy.ts",
        "models/ai-settings.ts",
        "models/ai-base-url.ts",
        "actions/**/*.ts",
        "proxy.ts",
        "viewmodels/**/*.ts",
        "hooks/**/*.tsx",
        "components/app-sidebar.tsx",
        "components/dashboard-shell.tsx",
        "components/theme-toggle.tsx",
        "components/dashboard/**/*.tsx",
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
        "lib/palette.ts",
        // Thin wrappers
        "app/api/auth/**",
        // Shadcn/UI auto-generated primitives
        "components/ui/",
        // View/page components (presentation only)
        "app/**/page.tsx",
        "app/**/layout.tsx",
        // Large page components tested via E2E
        "components/dashboard/ideas-page.tsx",
        "components/dashboard/idea-editor-page.tsx",
        "components/dashboard/api-keys-page.tsx",
        "components/dashboard/todos-page.tsx",
        "components/dashboard/ai-settings-page.tsx",
        // The todos-page-parts primitives are unit-tested where they carry
        // logic; the composition-heavy shells (tree shell, detail pane,
        // tree row) are covered by C15 L1 tests and C11's E2E path.
        "components/dashboard/todos-page-parts/todo-tree-shell.tsx",
        "components/dashboard/todos-page-parts/todo-tree-row.tsx",
        "components/dashboard/todos-page-parts/todo-detail-pane.tsx",
        // Presentation-only components
        "components/markdown-preview.tsx",
        // Editor viewmodel — tested via E2E
        "viewmodels/useIdeaEditorViewModel.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 90,
        branches: 85,
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
