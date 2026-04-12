/**
 * Configuration management for zhe CLI
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { ConfigManager } from "@nocoo/cli-base";

export interface ZheConfig extends Record<string, unknown> {
	apiKey?: string;
	defaultFolderId?: string;
	outputFormat?: "table" | "json" | "minimal";
}

/**
 * Create a ConfigManager instance. Exported for testing.
 */
export function createConfigManager(
	configDir?: string,
	isDev?: boolean,
): ConfigManager<ZheConfig> {
	const dir = configDir ?? join(homedir(), ".config", "zhe");
	const dev = isDev ?? process.env.ZHE_DEV === "1";
	return new ConfigManager<ZheConfig>(dir, dev);
}

// Default singleton instance
let _config: ConfigManager<ZheConfig> | null = null;

function getConfig(): ConfigManager<ZheConfig> {
	if (!_config) {
		_config = createConfigManager();
	}
	return _config;
}

/**
 * For testing: reset the singleton config instance
 */
export function _resetConfig(): void {
	_config = null;
}

/**
 * For testing: set a custom config instance
 */
export function _setConfig(config: ConfigManager<ZheConfig>): void {
	_config = config;
}

/**
 * Get the API key from config
 */
export function getApiKey(): string | undefined {
	return getConfig().get("apiKey");
}

/**
 * Save the API key to config
 */
export function saveApiKey(apiKey: string): void {
	getConfig().set("apiKey", apiKey);
}

/**
 * Clear the API key from config
 */
export function clearApiKey(): void {
	const config = getConfig();
	const current = config.read();
	const { apiKey: _, ...rest } = current;
	// Delete and rewrite without apiKey
	config.delete();
	if (Object.keys(rest).length > 0) {
		config.write(rest as ZheConfig);
	}
}

/**
 * Get output format from config
 */
export function getOutputFormat(): "table" | "json" | "minimal" {
	return getConfig().get("outputFormat") || "table";
}
