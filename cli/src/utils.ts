/**
 * Shared utilities for zhe CLI
 */

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
 * Format links as a table
 */
export function formatLinksTable(links: Link[]): string {
	if (links.length === 0) {
		return "No links found.";
	}

	const header =
		"ID     SLUG        URL                              CLICKS  CREATED";
	const separator = "─".repeat(header.length);

	const rows = links.map((link) => {
		const id = String(link.id).padEnd(6);
		const slug = truncate(link.slug, 10).padEnd(11);
		const url = truncate(link.originalUrl, 32).padEnd(32);
		const clicks = String(link.clicks).padEnd(7);
		const created = formatDate(link.createdAt);
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
 */
export function formatLinkDetail(link: Link): string {
	const lines = [
		`Link #${link.id}`,
		"",
		`  Short URL:    ${link.shortUrl}`,
		`  Original:     ${link.originalUrl}`,
		`  Slug:         ${link.slug}${link.isCustom ? " (custom)" : ""}`,
		`  Clicks:       ${link.clicks}`,
	];

	if (link.folderId) {
		lines.push(`  Folder:       ${link.folderId}`);
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
 * Parse a link ID from string, return null if invalid
 */
export function parseLinkId(input: string): number | null {
	const id = Number.parseInt(input, 10);
	if (Number.isNaN(id) || id <= 0) {
		return null;
	}
	return id;
}

/**
 * Format folders as a table
 */
export function formatFoldersTable(folders: Folder[]): string {
	if (folders.length === 0) {
		return "No folders found.";
	}

	const header =
		"ID                                   NAME               ICON     CREATED";
	const separator = "─".repeat(header.length);

	const rows = folders.map((folder) => {
		const id = folder.id.padEnd(36);
		const name = truncate(folder.name, 18).padEnd(18);
		const icon = truncate(folder.icon, 8).padEnd(8);
		const created = formatDate(folder.createdAt);
		return `${id} ${name} ${icon} ${created}`;
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
