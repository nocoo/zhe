import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    passWithNoTests: false,
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
        "**/*.d.ts",
        "**/types.ts",
        // Command handlers — integration-level code (stdin/process.exit), planned for future E2E.
        "src/commands/**/*.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
