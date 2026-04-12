/**
 * zhe update <id> — Update an existing link
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
import type { UpdateLinkRequest } from "../api/types.js";
import { getApiKey } from "../config.js";
import { parseLinkId } from "../utils.js";

export const updateCommand = defineCommand({
	meta: {
		name: "update",
		description: "Update an existing link",
	},
	args: {
		id: {
			type: "positional",
			description: "Link ID (numeric)",
			required: true,
		},
		url: {
			type: "string",
			alias: "u",
			description: "New destination URL",
		},
		slug: {
			type: "string",
			alias: "s",
			description: "New slug",
		},
		folder: {
			type: "string",
			alias: "f",
			description: 'New folder ID (use "none" to remove)',
		},
		note: {
			type: "string",
			alias: "n",
			description: 'New note (use "" to clear)',
		},
		expires: {
			type: "string",
			alias: "e",
			description: 'New expiration (use "never" to remove)',
		},
		title: {
			type: "string",
			alias: "t",
			description: 'Meta title (use "" to clear)',
		},
		desc: {
			type: "string",
			alias: "d",
			description: 'Meta description (use "" to clear)',
		},
		screenshot: {
			type: "string",
			description: 'Screenshot URL (use "" to clear)',
		},
		"add-tag": {
			type: "string",
			description: "Add tag to link (by name or ID)",
		},
		"remove-tag": {
			type: "string",
			description: "Remove tag from link (by name or ID)",
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

		// Build update payload
		const data: UpdateLinkRequest = {};

		if (args.url !== undefined) {
			// Validate URL
			if (!isValidUrl(args.url)) {
				console.log(pc.red("Invalid URL format. Include protocol (https://)."));
				process.exit(EXIT_INVALID_ARGS);
			}
			data.originalUrl = args.url;
		}

		if (args.slug !== undefined) {
			data.slug = args.slug;
		}

		if (args.folder !== undefined) {
			data.folderId = args.folder === "none" ? null : args.folder;
		}

		if (args.note !== undefined) {
			data.note = args.note === "" ? null : args.note;
		}

		if (args.expires !== undefined) {
			data.expiresAt = args.expires === "never" ? null : args.expires;
		}

		if (args.title !== undefined) {
			data.metaTitle = args.title === "" ? null : args.title;
		}

		if (args.desc !== undefined) {
			data.metaDescription = args.desc === "" ? null : args.desc;
		}

		if (args.screenshot !== undefined) {
			data.screenshotUrl = args.screenshot === "" ? null : args.screenshot;
		}

		const addTag = args["add-tag"] as string | undefined;
		const removeTag = args["remove-tag"] as string | undefined;

		if (addTag) {
			data.addTags = [addTag];
		}

		if (removeTag) {
			data.removeTags = [removeTag];
		}

		// Check if there's anything to update
		if (Object.keys(data).length === 0) {
			console.log(pc.yellow("No changes specified."));
			console.log(
				pc.dim(
					"Use --url, --slug, --folder, --note, --expires, --title, --desc, --screenshot, --add-tag, or --remove-tag",
				),
			);
			process.exit(EXIT_INVALID_ARGS);
		}

		const client = new ApiClient(apiKey);

		try {
			const response = await client.updateLink(id, data);

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
			} else {
				console.log(pc.green(`✓ Updated link #${id}`));
			}
		} catch (error) {
			handleApiError(error);
		}
	},
});

function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function handleApiError(error: unknown): never {
	if (error instanceof ApiClientError) {
		if (error.status === 409) {
			console.log(pc.red("Slug is already in use."));
		} else {
			console.log(pc.red(`Error: ${error.message}`));
		}

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
