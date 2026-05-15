/**
 * Shared utilities for zhe CLI
 */

import { spawn } from "node:child_process";
import { pc } from "@nocoo/cli-base";
import type { ApiClient } from "./api/client.js";
import type { Folder, Link, Tag } from "./api/types.js";

/**
 * Mask an API key for display: zhe_abcd...wxyz
 */
export function maskApiKey(apiKey: string): string {
	if (!apiKey || apiKey.length < 12) {
		return apiKey;
	}
	const prefix = apiKey.slice(0, 8);
	const suffix = apiKey.slice(-4);
	return `${prefix}...${suffix}`;
}

/**
 * Validate API key format: must start with zhe_ and be non-empty
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
	return apiKey.startsWith("zhe_") && apiKey.length > 4;
}

/**
 * Format a date string for display
 */
export function formatDate(isoDate: string): string {
	const date = new Date(isoDate);
	const parts = date.toISOString().split("T");
	return parts[0] ?? "";
}

/**
 * Format a date string with time
 */
export function formatDateTime(isoDate: string): string {
	const date = new Date(isoDate);
	return date.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Truncate a string to a max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) {
		return str;
	}
	return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Options for formatLinksTable
 */
export interface FormatLinksTableOptions {
	wide?: boolean;
	folderMap?: Map<string, string>;
}

/**
 * Format links as a table
 */
export function formatLinksTable(
	links: Link[],
	options: FormatLinksTableOptions = {},
): string {
	if (links.length === 0) {
		return "No links found.";
	}

	const { wide = false, folderMap } = options;
	const showFolders = links.some((l) => l.folderId);

	if (wide) {
		// Wide mode: no truncation
		const header = showFolders
			? "ID     SLUG                 URL                                              FOLDER           CLICKS  CREATED"
			: "ID     SLUG                 URL                                              CLICKS  CREATED";
		const separator = "─".repeat(header.length);

		const rows = links.map((link) => {
			const id = String(link.id).padEnd(6);
			const slug = link.slug.padEnd(20);
			const url = link.originalUrl.padEnd(48);
			const clicks = String(link.clicks).padEnd(7);
			const created = formatDate(link.createdAt);
			if (showFolders) {
				const folderName = link.folderId
					? (folderMap?.get(link.folderId) ?? link.folderId.slice(0, 8))
					: "";
				const folder = folderName.padEnd(16);
				return `${id} ${slug} ${url} ${folder} ${clicks} ${created}`;
			}
			return `${id} ${slug} ${url} ${clicks} ${created}`;
		});

		return [header, separator, ...rows].join("\n");
	}

	// Default compact mode with truncation
	const header = showFolders
		? "ID     SLUG        URL                              FOLDER       CLICKS  CREATED"
		: "ID     SLUG        URL                              CLICKS  CREATED";
	const separator = "─".repeat(header.length);

	const rows = links.map((link) => {
		const id = String(link.id).padEnd(6);
		const slug = truncate(link.slug, 10).padEnd(11);
		const url = truncate(link.originalUrl, 32).padEnd(32);
		const clicks = String(link.clicks).padEnd(7);
		const created = formatDate(link.createdAt);
		if (showFolders) {
			const folderName = link.folderId
				? (folderMap?.get(link.folderId) ?? link.folderId.slice(0, 8))
				: "";
			const folder = truncate(folderName, 12).padEnd(12);
			return `${id} ${slug} ${url} ${folder} ${clicks} ${created}`;
		}
		return `${id} ${slug} ${url} ${clicks} ${created}`;
	});

	return [header, separator, ...rows].join("\n");
}

/**
 * Format links as minimal output (just short URLs)
 */
export function formatLinksMinimal(links: Link[]): string {
	if (links.length === 0) {
		return "";
	}
	return links.map((link) => `zhe.to/${link.slug}`).join("\n");
}

/**
 * Format a single link for detailed display
 * @param link - The link to format
 * @param folderName - Optional folder name (if not provided, shows folder ID)
 */
export function formatLinkDetail(link: Link, folderName?: string): string {
	const lines = [
		`Link #${link.id}`,
		"",
		`  Short URL:    ${link.shortUrl}`,
		`  Original:     ${link.originalUrl}`,
		`  Slug:         ${link.slug}${link.isCustom ? " (custom)" : ""}`,
		`  Clicks:       ${link.clicks}`,
	];

	if (link.folderId) {
		const folderDisplay = folderName ?? link.folderId;
		lines.push(`  Folder:       ${folderDisplay}`);
	}

	if (link.note) {
		lines.push(`  Note:         ${link.note}`);
	}

	lines.push(
		`  Expires:      ${link.expiresAt ? formatDateTime(link.expiresAt) : "Never"}`,
	);
	lines.push(`  Created:      ${formatDateTime(link.createdAt)}`);

	return lines.join("\n");
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

/**
 * Parse a link ID from string, return null if invalid.
 * Uses strict positive-integer parsing.
 */
export function parseLinkId(input: string): number | null {
	return parsePositiveInt(input);
}

/**
 * Format folders as a table
 */
export function formatFoldersTable(folders: Folder[]): string {
	if (folders.length === 0) {
		return "No folders found.";
	}

	const header =
		"ID                                   NAME               LINKS  ICON     CREATED";
	const separator = "─".repeat(header.length);

	const rows = folders.map((folder) => {
		const id = folder.id.padEnd(36);
		const name = truncate(folder.name, 18).padEnd(18);
		const links = String(folder.linkCount).padEnd(6);
		const icon = truncate(folder.icon, 8).padEnd(8);
		const created = formatDate(folder.createdAt);
		return `${id} ${name} ${links} ${icon} ${created}`;
	});

	return [header, separator, ...rows].join("\n");
}

/**
 * Format tags as a table
 */
export function formatTagsTable(tags: Tag[]): string {
	if (tags.length === 0) {
		return "No tags found.";
	}

	const header =
		"ID                                   NAME               COLOR    CREATED";
	const separator = "─".repeat(header.length);

	const rows = tags.map((tag) => {
		const id = tag.id.padEnd(36);
		const name = truncate(tag.name, 18).padEnd(18);
		const color = tag.color.padEnd(8);
		const created = formatDate(tag.createdAt);
		return `${id} ${name} ${color} ${created}`;
	});

	return [header, separator, ...rows].join("\n");
}

/**
 * Resolve a folder name to folder ID via API.
 * If input looks like a UUID, use it directly.
 * Returns null if folder is not found (with error message printed).
 */
export async function resolveFolderName(
	client: ApiClient,
	input: string,
): Promise<string | null> {
	// Check if input looks like a UUID (36 chars with dashes)
	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (uuidPattern.test(input)) {
		return input; // Assume it's already an ID
	}

	// Otherwise, resolve by name
	const { folders } = await client.listFolders();
	const matches = folders.filter(
		(f: Folder) => f.name.toLowerCase() === input.toLowerCase(),
	);

	if (matches.length === 0) {
		console.log(pc.red(`Folder not found: ${input}`));
		return null;
	}

	if (matches.length > 1) {
		console.log(
			pc.red(
				`Multiple folders match "${input}". Please use the folder ID instead.`,
			),
		);
		console.log(pc.dim("Use `zhe folders` to see all folder IDs."));
		return null;
	}

	return matches[0].id;
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

/**
 * Resolve a tag name to tag ID via API.
 * If input looks like a UUID, use it directly.
 * Returns null if tag is not found (with error message printed).
 *
 * Pass `notFoundMessage` to override the default "Create it first." hint
 * — appropriate for tag attach/use callers but misleading for tag update/delete.
 */
export async function resolveTagName(
	client: ApiClient,
	input: string,
	options: { notFoundMessage?: string } = {},
): Promise<string | null> {
	// Check if input looks like a UUID
	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (uuidPattern.test(input)) {
		return input;
	}

	const { tags } = await client.listTags();
	const matches = tags.filter(
		(t: Tag) => t.name.toLowerCase() === input.toLowerCase(),
	);

	if (matches.length === 0) {
		const message =
			options.notFoundMessage ?? `Tag not found: ${input}. Create it first.`;
		console.log(pc.red(message));
		return null;
	}

	if (matches.length > 1) {
		console.log(
			pc.red(
				`Multiple tags match "${input}". Please use the tag ID or rename duplicates.`,
			),
		);
		return null;
	}

	return matches[0].id;
}

/**
 * Resolve a tag ref (name or UUID) to both its id and current name.
 *
 * Unlike resolveTagName, this always hits the API so the caller can show the
 * real name in destructive-action prompts even when a UUID was passed in.
 * Returns null if no tag matches (without printing — caller chooses the
 * message and exit code). API errors propagate so the caller can route them
 * through its shared error handler.
 */
export async function resolveTagRef(
	client: ApiClient,
	input: string,
): Promise<{ id: string; name: string } | null> {
	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const { tags } = await client.listTags();

	if (uuidPattern.test(input)) {
		const byId = tags.find((t: Tag) => t.id === input);
		return byId ? { id: byId.id, name: byId.name } : null;
	}

	const matches = tags.filter(
		(t: Tag) => t.name.toLowerCase() === input.toLowerCase(),
	);
	if (matches.length === 1) {
		return { id: matches[0].id, name: matches[0].name };
	}
	return null;
}

/**
 * Normalize a hex color: strip leading "#", validate 6 hex digits, return "#xxxxxx".
 * Returns null if input is not a valid 6-digit hex color.
 */
export function normalizeHexColor(input: string): string | null {
	const stripped = input.startsWith("#") ? input.slice(1) : input;
	if (!/^[0-9a-fA-F]{6}$/.test(stripped)) {
		return null;
	}
	return `#${stripped.toLowerCase()}`;
}
