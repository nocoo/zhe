/**
 * Shared utilities for zhe CLI.
 *
 * Larger groups live in ./utils/*.ts:
 *   - ./utils/format.ts   table + detail formatters
 *   - ./utils/resolve.ts  folder/tag name → id resolvers
 *
 * This file keeps the small primitives (date/string helpers, parsing,
 * browser launcher) so consumers can still import everything from
 * `../utils.js`.
 */

import { spawn } from "node:child_process";
import { pc } from "@nocoo/cli-base";

/** Mask an API key for display: zhe_abcd...wxyz */
export function maskApiKey(apiKey: string): string {
	if (!apiKey || apiKey.length < 12) {
		return apiKey;
	}
	const prefix = apiKey.slice(0, 8);
	const suffix = apiKey.slice(-4);
	return `${prefix}...${suffix}`;
}

/** Validate API key format: must start with zhe_ and be non-empty. */
export function isValidApiKeyFormat(apiKey: string): boolean {
	return apiKey.startsWith("zhe_") && apiKey.length > 4;
}

/** Format a date string for display (YYYY-MM-DD). */
export function formatDate(isoDate: string): string {
	const date = new Date(isoDate);
	const parts = date.toISOString().split("T");
	return parts[0] ?? "";
}

/** Format a date string with time (YYYY-MM-DD HH:MM:SS). */
export function formatDateTime(isoDate: string): string {
	const date = new Date(isoDate);
	return date.toISOString().replace("T", " ").slice(0, 19);
}

/** Truncate a string to a max length with ellipsis. */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) {
		return str;
	}
	return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Strict positive-integer parser.
 * Rejects empty strings, 0, negatives, decimals, scientific notation,
 * hex literals, and any junk-suffixed input (e.g. "12abc", "1e2", "0x10").
 * Only accepts decimal digit sequences without a leading zero.
 */
const STRICT_POSITIVE_INT = /^[1-9]\d*$/;

export function parsePositiveInt(input: string): number | null {
	if (!STRICT_POSITIVE_INT.test(input)) {
		return null;
	}
	const id = Number(input);
	if (!Number.isSafeInteger(id) || id <= 0) {
		return null;
	}
	return id;
}

/** Parse a link ID from string; uses strict positive-integer parsing. */
export function parseLinkId(input: string): number | null {
	return parsePositiveInt(input);
}

/**
 * Open a URL in the default browser.
 * Uses spawn() with argv to prevent shell injection.
 */
export function openInBrowser(url: string): void {
	const platform = process.platform;
	let command: string;
	let args: string[];

	if (platform === "darwin") {
		command = "open";
		args = [url];
	} else if (platform === "linux") {
		command = "xdg-open";
		args = [url];
	} else if (platform === "win32") {
		command = "cmd";
		args = ["/c", "start", "", url];
	} else {
		console.log(pc.dim(`Unable to open browser on ${platform}. Visit: ${url}`));
		return;
	}

	const child = spawn(command, args, { stdio: "ignore" });
	const fallback = () =>
		console.log(pc.dim(`Failed to open browser. Visit: ${url}`));
	let failed = false;
	child.on("error", () => {
		failed = true;
		fallback();
	});
	child.on("close", (code) => {
		if (!failed && code !== 0) {
			fallback();
		}
	});
}

// ── Re-exports ──────────────────────────────────────────────────────────────
// Keep `../utils.js` the single public import surface for CLI commands and
// tests; implementations live in ./utils/*.ts.

export {
	type FormatLinksTableOptions,
	formatFoldersTable,
	formatLinkDetail,
	formatLinksMinimal,
	formatLinksTable,
	formatTagsTable,
} from "./utils/format.js";

export {
	resolveFolderName,
	resolveTagName,
	resolveTagRef,
	type TagRef,
} from "./utils/resolve.js";
