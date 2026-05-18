/**
 * Name/UUID resolvers for folders and tags. Extracted from utils.ts.
 */

import { pc } from "@nocoo/cli-base";
import type { ApiClient } from "../api/client.js";
import type { Folder, Tag } from "../api/types.js";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a folder name to folder ID via API.
 * If input looks like a UUID, use it directly.
 * Returns null if folder is not found (with error message printed).
 */
export async function resolveFolderName(
	client: ApiClient,
	input: string,
): Promise<string | null> {
	if (UUID_PATTERN.test(input)) {
		return input; // Assume it's already an ID
	}

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
 * Resolve a tag name to tag ID via API.
 * If input looks like a UUID, use it directly.
 * Returns null if tag is not found (with error message printed).
 */
export async function resolveTagName(
	client: ApiClient,
	input: string,
): Promise<string | null> {
	if (UUID_PATTERN.test(input)) {
		return input;
	}

	const { tags } = await client.listTags();
	const matches = tags.filter(
		(t: Tag) => t.name.toLowerCase() === input.toLowerCase(),
	);

	if (matches.length === 0) {
		console.log(pc.red(`Tag not found: ${input}. Create it first.`));
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
 * Resolve a tag reference (name or UUID) to its canonical id + name.
 *
 * Unlike `resolveTagName`, this:
 *   - Distinguishes `not_found` (zero matches) from `ambiguous` (multiple
 *     name matches), letting callers map them to different exit codes.
 *   - For UUID input, returns immediately without calling `listTags()` so
 *     that API keys with only `tags:write` (no `tags:read`) can still
 *     update/delete by ID. The server is the source of truth for whether
 *     the tag exists. `name` is `undefined` in that case; callers should
 *     fall back to the UUID in any prompt text.
 *
 * Does NOT print any error itself — callers decide messaging and exit codes.
 */
export type TagRef =
	| { kind: "found"; id: string; name: string | undefined }
	| { kind: "not_found" }
	| { kind: "ambiguous" };

export async function resolveTagRef(
	client: ApiClient,
	input: string,
): Promise<TagRef> {
	if (UUID_PATTERN.test(input)) {
		// Trust the UUID; let the destructive op's PATCH/DELETE be the
		// authoritative existence check. Avoids requiring tags:read.
		// Normalize to lowercase: tag IDs are stored lowercase, but the
		// regex accepts uppercase (RFC 4122 allows either case in
		// notation). The DB is `WHERE id = ?` text-equal, so an
		// uppercase UUID would 404 on a tag that actually exists.
		return { kind: "found", id: input.toLowerCase(), name: undefined };
	}

	const { tags } = await client.listTags();
	const matches = tags.filter(
		(t: Tag) => t.name.toLowerCase() === input.toLowerCase(),
	);
	if (matches.length === 0) {
		return { kind: "not_found" };
	}
	if (matches.length > 1) {
		return { kind: "ambiguous" };
	}
	return { kind: "found", id: matches[0].id, name: matches[0].name };
}
