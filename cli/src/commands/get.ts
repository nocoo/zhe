/**
 * zhe get <id> — Get link details
 */

import { defineCommand, pc } from "@nocoo/cli-base";
import {
	ApiClient,
	ApiClientError,
	EXIT_AUTH_REQUIRED,
	EXIT_ERROR,
	EXIT_INVALID_ARGS,
	EXIT_NOT_FOUND,
	EXIT_RATE_LIMITED,
} from "../api/client.js";
import type { Folder, Tag } from "../api/types.js";
import { getApiKey } from "../config.js";
import { formatLinkDetail, parseLinkId } from "../utils.js";

export const getCommand = defineCommand({
	meta: {
		name: "get",
		description: "Get link details",
	},
	args: {
		id: {
			type: "positional",
			description: "Link ID (numeric)",
			required: true,
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		const apiKey = getApiKey();
		if (!apiKey) {
			console.log(pc.red("Not authenticated. Run `zhe login` first."));
			process.exit(EXIT_AUTH_REQUIRED);
		}

		const idStr = args.id as string;
		const id = parseLinkId(idStr);
		if (id === null) {
			console.log(pc.red("Invalid link ID. Must be a number."));
			process.exit(EXIT_INVALID_ARGS);
		}

		const client = new ApiClient(apiKey);

		try {
			const response = await client.getLink(id);

			// If link has folderId, fetch folder name for better display
			let folderName: string | undefined;
			if (response.link.folderId) {
				try {
					const foldersResponse = await client.listFolders();
					const folder = foldersResponse.folders.find(
						(f: Folder) => f.id === response.link.folderId,
					);
					if (folder) {
						folderName = folder.name;
					}
				} catch {
					// If folder fetch fails, continue without folder name
				}
			}

			// Resolve tag names if the link has tags (best-effort)
			let tagMap: Map<string, string> | undefined;
			if ((response.link.tagIds ?? []).length > 0) {
				try {
					const tagsResponse = await client.listTags();
					tagMap = new Map(tagsResponse.tags.map((t: Tag) => [t.id, t.name]));
				} catch {
					// If tag fetch fails, continue without tag names
				}
			}

			if (args.json) {
				// Enrich JSON output with folderName if available
				if (folderName) {
					const enrichedResponse = {
						...response,
						link: {
							...response.link,
							folderName,
						},
					};
					console.log(JSON.stringify(enrichedResponse, null, 2));
				} else {
					console.log(JSON.stringify(response, null, 2));
				}
			} else {
				console.log(formatLinkDetail(response.link, folderName, tagMap));
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
		if (error.status === 404) {
			process.exit(EXIT_NOT_FOUND);
		}
		if (error.status === 429) {
			process.exit(EXIT_RATE_LIMITED);
		}
		process.exit(EXIT_ERROR);
	}
	throw error;
}
