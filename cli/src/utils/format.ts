/**
 * Table / detail formatters for the zhe CLI.
 * Extracted from utils.ts to keep that file small.
 */

import type { Folder, Link, Tag } from "../api/types.js";
import { formatDate, formatDateTime, truncate } from "../utils.js";

export interface FormatLinksTableOptions {
	wide?: boolean;
	folderMap?: Map<string, string>;
	tagMap?: Map<string, string>;
	showTags?: boolean;
}

/** Render the tag column for a single link row. */
function renderLinkTags(
	link: Link,
	tagMap: Map<string, string> | undefined,
): string {
	// Prefer embedded tags (carries names) — avoids needing a tagMap fetch
	// from the caller when /links already returned tag details.
	if (link.tags && link.tags.length > 0) {
		return link.tags.map((t) => t.name).join(",");
	}
	const ids = link.tagIds ?? [];
	if (ids.length === 0) return "";
	return ids.map((id) => tagMap?.get(id) ?? id.slice(0, 8)).join(",");
}

function renderLinkRowWide(
	link: Link,
	opts: {
		showFolders: boolean;
		showTags: boolean;
		folderMap?: Map<string, string>;
		tagMap?: Map<string, string>;
	},
): string {
	const id = String(link.id).padEnd(6);
	const slug = link.slug.padEnd(20);
	const url = link.originalUrl.padEnd(48);
	const clicks = String(link.clicks).padEnd(7);
	const created = formatDate(link.createdAt);
	let row = `${id} ${slug} ${url} `;
	if (opts.showFolders) {
		const folderName = link.folderId
			? (opts.folderMap?.get(link.folderId) ?? link.folderId.slice(0, 8))
			: "";
		row += `${folderName.padEnd(16)} `;
	}
	if (opts.showTags) {
		row += `${renderLinkTags(link, opts.tagMap).padEnd(26)} `;
	}
	row += `${clicks} ${created}`;
	return row;
}

function renderLinkRowCompact(
	link: Link,
	opts: {
		showFolders: boolean;
		showTags: boolean;
		folderMap?: Map<string, string>;
		tagMap?: Map<string, string>;
	},
): string {
	const id = String(link.id).padEnd(6);
	const slug = truncate(link.slug, 10).padEnd(11);
	const url = truncate(link.originalUrl, 32).padEnd(32);
	const clicks = String(link.clicks).padEnd(7);
	const created = formatDate(link.createdAt);
	let row = `${id} ${slug} ${url} `;
	if (opts.showFolders) {
		const folderName = link.folderId
			? (opts.folderMap?.get(link.folderId) ?? link.folderId.slice(0, 8))
			: "";
		row += `${truncate(folderName, 12).padEnd(12)} `;
	}
	if (opts.showTags) {
		row += `${truncate(renderLinkTags(link, opts.tagMap), 12).padEnd(12)} `;
	}
	row += `${clicks} ${created}`;
	return row;
}

/** Format links as a table (wide or compact). */
export function formatLinksTable(
	links: Link[],
	options: FormatLinksTableOptions = {},
): string {
	if (links.length === 0) return "No links found.";

	const { wide = false, folderMap, tagMap, showTags = false } = options;
	const showFolders = links.some((l) => l.folderId);
	const rowOpts = { showFolders, showTags, folderMap, tagMap };

	if (wide) {
		let header =
			"ID     SLUG                 URL                                              ";
		if (showFolders) header += "FOLDER           ";
		if (showTags) header += "TAGS                       ";
		header += "CLICKS  CREATED";
		const separator = "─".repeat(header.length);
		const rows = links.map((l) => renderLinkRowWide(l, rowOpts));
		return [header, separator, ...rows].join("\n");
	}

	let header = "ID     SLUG        URL                              ";
	if (showFolders) header += "FOLDER       ";
	if (showTags) header += "TAGS         ";
	header += "CLICKS  CREATED";
	const separator = "─".repeat(header.length);
	const rows = links.map((l) => renderLinkRowCompact(l, rowOpts));
	return [header, separator, ...rows].join("\n");
}

/** Minimal one-link-per-line output (just short URLs). */
export function formatLinksMinimal(links: Link[]): string {
	if (links.length === 0) return "";
	return links.map((link) => `zhe.to/${link.slug}`).join("\n");
}

/**
 * Detailed multi-line output for a single link.
 * @param link - The link to format
 * @param folderName - Optional folder name (if not provided, shows folder ID)
 * @param tagMap - Optional map of tagId → name (falls back to tagId if missing)
 */
export function formatLinkDetail(
	link: Link,
	folderName?: string,
	tagMap?: Map<string, string>,
): string {
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

	if (link.tags && link.tags.length > 0) {
		lines.push(`  Tags:         ${link.tags.map((t) => t.name).join(", ")}`);
	} else {
		const tagIds = link.tagIds ?? [];
		if (tagIds.length > 0) {
			const tagDisplay = tagIds.map((id) => tagMap?.get(id) ?? id).join(", ");
			lines.push(`  Tags:         ${tagDisplay}`);
		}
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

/** Format folders as a table. */
export function formatFoldersTable(folders: Folder[]): string {
	if (folders.length === 0) return "No folders found.";

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

/** Format tags as a table. */
export function formatTagsTable(tags: Tag[]): string {
	if (tags.length === 0) return "No tags found.";

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
