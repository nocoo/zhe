import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        // CLI entrypoint — orchestration code, not unit-testable.
        "src/index.ts",
        // Command handlers — integration-level code (stdin/process.exit), planned for future E2E.
        "src/commands/**/*.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
