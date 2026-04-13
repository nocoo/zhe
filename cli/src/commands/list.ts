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
import type { ListLinksParams } from "../api/types.js";
import { getApiKey, getOutputFormat } from "../config.js";
import {
	formatLinksMinimal,
	formatLinksTable,
	resolveFolderName,
	resolveTagName,
} from "../utils.js";
import type { Folder } from "../api/types.js";

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
	},
	async run({ args }) {
		const apiKey = getApiKey();
		if (!apiKey) {
			console.log(pc.red("Not authenticated. Run `zhe login` first."));
			process.exit(EXIT_AUTH_REQUIRED);
		}

		// Validate mutually exclusive options
		if (args.inbox && args.folder) {
			console.log(pc.red("Cannot use --inbox and --folder together."));
			process.exit(EXIT_INVALID_ARGS);
		}

		// Validate sort option
		if (args.sort && args.sort !== "created" && args.sort !== "clicks") {
			console.log(pc.red("Invalid --sort value. Use 'created' or 'clicks'."));
			process.exit(EXIT_INVALID_ARGS);
		}

		// Validate order option
		if (args.order && args.order !== "asc" && args.order !== "desc") {
			console.log(pc.red("Invalid --order value. Use 'asc' or 'desc'."));
			process.exit(EXIT_INVALID_ARGS);
		}

		const client = new ApiClient(apiKey);

		try {
			// Build params object, only including defined fields
			const params: ListLinksParams = {};
			if (args.limit) params.limit = Number.parseInt(args.limit, 10);
			if (args.offset) params.offset = Number.parseInt(args.offset, 10);
			if (args.query) params.query = args.query;
			if (args.inbox) params.inbox = true;
			if (args.sort) params.sort = args.sort as "created" | "clicks";
			if (args.order) params.order = args.order as "asc" | "desc";

			// Resolve folder name to ID
			if (args.folder) {
				const folderId = await resolveFolderName(client, args.folder);
				if (folderId === null) {
					process.exit(EXIT_INVALID_ARGS);
				}
				params.folderId = folderId;
			}

			// Resolve tag name to ID
			if (args.tag) {
				const tagId = await resolveTagName(client, args.tag);
				if (tagId === null) {
					process.exit(EXIT_INVALID_ARGS);
				}
				params.tagId = tagId;
			}

			const response = await client.listLinks(params);

			// Count-only mode: use total from API response
			if (args.count) {
				console.log(response.total);
				return;
			}

			// Build folder name map for table output
			let folderMap: Map<string, string> | undefined;
			const hasFolders = response.links.some((l) => l.folderId);
			if (hasFolders) {
				try {
					const foldersResponse = await client.listFolders();
					folderMap = new Map(
						foldersResponse.folders.map((f: Folder) => [f.id, f.name]),
					);
				} catch {
					// If folder fetch fails, continue without folder names
				}
			}

			// Determine output format
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
						formatLinksTable(response.links, { wide: args.wide, folderMap }),
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
