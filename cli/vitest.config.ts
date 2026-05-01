import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
		environment: "node",
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			// experimentalAstAwareRemapping reduces variance and slightly improves
			// wall-clock by avoiding the legacy source-map-based remap path.
			experimentalAstAwareRemapping: true,
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
