import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	_resetConfig,
	_setConfig,
	clearApiKey,
	createConfigManager,
	getApiKey,
	getOutputFormat,
	saveApiKey,
} from "../src/config.js";

describe("config", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `zhe-config-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		_resetConfig();
	});

	afterEach(() => {
		_resetConfig();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("createConfigManager", () => {
		it("creates config manager with custom directory", () => {
			const config = createConfigManager(testDir, false);
			expect(config.configPath).toContain(testDir);
			expect(config.configPath).toContain("config.json");
		});

		it("uses dev config when isDev is true", () => {
			const config = createConfigManager(testDir, true);
			expect(config.configPath).toContain("config.dev.json");
		});
	});

	describe("getApiKey", () => {
		it("returns undefined when no API key is set", () => {
			const config = createConfigManager(testDir, false);
			_setConfig(config);

			expect(getApiKey()).toBeUndefined();
		});

		it("returns API key when set", () => {
			const config = createConfigManager(testDir, false);
			_setConfig(config);
			config.write({ apiKey: "zhe_testkey123" });

			expect(getApiKey()).toBe("zhe_testkey123");
		});
	});

	describe("saveApiKey", () => {
		it("saves API key to config", () => {
			const config = createConfigManager(testDir, false);
			_setConfig(config);

			saveApiKey("zhe_newkey");

			expect(config.get("apiKey")).toBe("zhe_newkey");
		});
	});

	describe("clearApiKey", () => {
		it("removes API key from config", () => {
			const config = createConfigManager(testDir, false);
			_setConfig(config);
			config.write({ apiKey: "zhe_toremove", outputFormat: "json" });

			clearApiKey();

			expect(config.get("apiKey")).toBeUndefined();
			expect(config.get("outputFormat")).toBe("json");
		});

		it("deletes config file when apiKey is the only field", () => {
			const config = createConfigManager(testDir, false);
			_setConfig(config);
			config.write({ apiKey: "zhe_only" });

			clearApiKey();

			expect(existsSync(config.configPath)).toBe(false);
		});
	});

	describe("default singleton initialization", () => {
		it("creates default config manager when getApiKey called without setConfig", () => {
			// Reset to clear any existing config
			_resetConfig();
			// Don't call _setConfig - let it use default lazy initialization
			// This will create a config in ~/.config/zhe
			const result = getApiKey();
			// Should return undefined (no key set) but not throw
			expect(result).toBeUndefined();
		});
	});

	describe("getOutputFormat", () => {
		it("returns 'table' as default", () => {
			const config = createConfigManager(testDir, false);
			_setConfig(config);

			expect(getOutputFormat()).toBe("table");
		});

		it("returns configured output format", () => {
			const config = createConfigManager(testDir, false);
			_setConfig(config);
			config.write({ outputFormat: "json" });

			expect(getOutputFormat()).toBe("json");
		});

		it("returns 'minimal' when configured", () => {
			const config = createConfigManager(testDir, false);
			_setConfig(config);
			config.write({ outputFormat: "minimal" });

			expect(getOutputFormat()).toBe("minimal");
		});
	});
});
