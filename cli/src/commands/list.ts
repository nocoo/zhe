/**
 * zhe list — List all links
 */

import { defineCommand, pc } from "@nocoo/cli-base";
import {
	ApiClient,
	ApiClientError,
	EXIT_AUTH_REQUIRED,
	EXIT_ERROR,
	EXIT_INVALID_ARGS,
	EXIT_RATE_LIMITED,
} from "../api/client.js";
import type { Folder, ListLinksParams, Tag } from "../api/types.js";
import { getApiKey, getOutputFormat } from "../config.js";
import {
	formatLinksMinimal,
	formatLinksTable,
	resolveTagName,
} from "../utils.js";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ListArgs {
	folder?: string;
	inbox?: boolean;
	sort?: string;
	order?: string;
	limit?: string;
	offset?: string;
	query?: string;
	tag?: string;
}

/** Reject mutually-exclusive flags + invalid sort/order. Exits on error. */
function validateListArgs(args: ListArgs): void {
	if (args.inbox && args.folder) {
		console.log(pc.red("Cannot use --inbox and --folder together."));
		process.exit(EXIT_INVALID_ARGS);
	}
	if (args.sort && args.sort !== "created" && args.sort !== "clicks") {
		console.log(pc.red("Invalid --sort value. Use 'created' or 'clicks'."));
		process.exit(EXIT_INVALID_ARGS);
	}
	if (args.order && args.order !== "asc" && args.order !== "desc") {
		console.log(pc.red("Invalid --order value. Use 'asc' or 'desc'."));
		process.exit(EXIT_INVALID_ARGS);
	}
}

/**
 * Build ListLinksParams from CLI args, resolving folder/tag names where
 * needed. Returns the params plus any folder list already fetched for reuse.
 * Exits on invalid folder/tag.
 */
async function buildListParams(
	client: ApiClient,
	args: ListArgs,
): Promise<{ params: ListLinksParams; cachedFolders?: Folder[] }> {
	// Pre-fetch folders only when --folder is a non-UUID name that must be
	// resolved (a UUID can be used directly without folders:read scope).
	const folderArg = args.folder;
	const needsFolderResolution = !!folderArg && !UUID_PATTERN.test(folderArg);
	let cachedFolders: Folder[] | undefined;
	if (needsFolderResolution) {
		const foldersResponse = await client.listFolders();
		cachedFolders = foldersResponse.folders;
	}

	const params: ListLinksParams = {};
	if (args.limit) params.limit = Number.parseInt(args.limit, 10);
	if (args.offset) params.offset = Number.parseInt(args.offset, 10);
	if (args.query) params.query = args.query;
	if (args.inbox) params.inbox = true;
	if (args.sort) params.sort = args.sort as "created" | "clicks";
	if (args.order) params.order = args.order as "asc" | "desc";

	if (folderArg) {
		if (UUID_PATTERN.test(folderArg)) {
			params.folderId = folderArg;
		} else if (cachedFolders) {
			const folderId = resolveFolderNameFromCache(folderArg, cachedFolders);
			if (folderId === null) process.exit(EXIT_INVALID_ARGS);
			params.folderId = folderId;
		}
	}

	if (args.tag) {
		const tagId = await resolveTagName(client, args.tag);
		if (tagId === null) process.exit(EXIT_INVALID_ARGS);
		params.tagId = tagId;
	}

	return cachedFolders ? { params, cachedFolders } : { params };
}

interface ListResponse {
	links: Array<{ folderId?: string | null; tagIds?: string[]; tags?: Tag[] }>;
	total: number;
}

/** Build folder + tag name maps for table output, with graceful fallback. */
async function loadDisplayMaps(
	client: ApiClient,
	links: ListResponse["links"],
	cachedFolders: Folder[] | undefined,
	showTags: boolean,
): Promise<{ folderMap?: Map<string, string>; tagMap?: Map<string, string> }> {
	const result: { folderMap?: Map<string, string>; tagMap?: Map<string, string> } = {};

	const hasFolders = links.some((l) => l.folderId);
	if (hasFolders) {
		try {
			const folders = cachedFolders ?? (await client.listFolders()).folders;
			result.folderMap = new Map(folders.map((f: Folder) => [f.id, f.name]));
		} catch {
			// continue without folder names
		}
	}

	// Build tag name map only when we will render tags AND the response is
	// missing embedded tag details. The /links endpoint already includes
	// `tags: Tag[]` per link, so a successful response makes listTags()
	// unnecessary; we only fall back when some tagged link is missing its
	// tags array (older server, or partial response).
	const needsTagFallback =
		showTags &&
		links.some(
			(l) => (l.tagIds ?? []).length > 0 && (!l.tags || l.tags.length === 0),
		);
	if (needsTagFallback) {
		try {
			const tagsResponse = await client.listTags();
			result.tagMap = new Map(tagsResponse.tags.map((t: Tag) => [t.id, t.name]));
		} catch {
			// continue without tag names
		}
	}

	return result;
}

export const listCommand = defineCommand({
	meta: {
		name: "list",
		description: "List all links",
	},
	args: {
		query: {
			type: "string",
			alias: "q",
			description: "Search by slug, URL, note, or title",
		},
		folder: {
			type: "string",
			alias: "f",
			description: "Filter by folder name or ID",
		},
		inbox: {
			type: "boolean",
			alias: "i",
			description: "Show uncategorized links only (no folder)",
		},
		tag: {
			type: "string",
			alias: "t",
			description: "Filter by tag name or ID",
		},
		sort: {
			type: "string",
			alias: "s",
			description: "Sort by: created (default), clicks",
		},
		order: {
			type: "string",
			description: "Sort order: desc (default), asc",
		},
		limit: {
			type: "string",
			alias: "l",
			description: "Max results (default: 50, max: 500)",
		},
		offset: {
			type: "string",
			alias: "o",
			description: "Pagination offset (default: 0)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
		minimal: {
			type: "boolean",
			description: "Output short URLs only",
		},
		wide: {
			type: "boolean",
			alias: "w",
			description: "Show full URLs without truncation",
		},
		count: {
			type: "boolean",
			alias: "c",
			description: "Show only the count of matching links",
		},
		"show-tags": {
			type: "boolean",
			description: "Show TAGS column in table output (auto-enabled with --tag)",
		},
	},
	async run({ args }) {
		const apiKey = getApiKey();
		if (!apiKey) {
			console.log(pc.red("Not authenticated. Run `zhe login` first."));
			process.exit(EXIT_AUTH_REQUIRED);
		}

		validateListArgs(args as ListArgs);

		const client = new ApiClient(apiKey);

		try {
			const { params, cachedFolders } = await buildListParams(client, args as ListArgs);

			const response = await client.listLinks(params);

			if (args.count) {
				console.log(response.total);
				return;
			}

			const showTags = !!(args["show-tags"] || args.tag);
			const { folderMap, tagMap } = await loadDisplayMaps(
				client,
				response.links,
				cachedFolders,
				showTags,
			);

			let format = getOutputFormat();
			if (args.json) format = "json";
			if (args.minimal) format = "minimal";

			switch (format) {
				case "json":
					console.log(JSON.stringify(response, null, 2));
					break;
				case "minimal":
					console.log(formatLinksMinimal(response.links));
					break;
				default:
					console.log(
						formatLinksTable(response.links, {
							wide: args.wide,
							folderMap,
							tagMap,
							showTags,
						}),
					);
			}
		} catch (error) {
			handleApiError(error);
		}
	},
});

function handleApiError(error: unknown): never {
	if (error instanceof ApiClientError) {
		console.log(pc.red(`Error: ${error.message}`));
		if (error.status === 401) {
			process.exit(EXIT_AUTH_REQUIRED);
		}
		if (error.status === 429) {
			process.exit(EXIT_RATE_LIMITED);
		}
		process.exit(EXIT_ERROR);
	}
	throw error;
}

/**
 * Resolve folder name to ID from cached folders list.
 * If input looks like a UUID, use it directly.
 * Returns null if folder is not found (with error message printed).
 */
function resolveFolderNameFromCache(
	input: string,
	folders: Folder[],
): string | null {
	// Check if input looks like a UUID (36 chars with dashes)
	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (uuidPattern.test(input)) {
		return input; // Assume it's already an ID
	}

	// Otherwise, resolve by name
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
