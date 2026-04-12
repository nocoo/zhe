/**
 * zhe tags — List all tags
 */

import { defineCommand, pc } from "@nocoo/cli-base";
import {
	ApiClient,
	ApiClientError,
	EXIT_AUTH_REQUIRED,
	EXIT_ERROR,
	EXIT_RATE_LIMITED,
} from "../api/client.js";
import { getApiKey } from "../config.js";
import { formatTagsTable } from "../utils.js";

export const tagsCommand = defineCommand({
	meta: {
		name: "tags",
		description: "List all tags",
	},
	args: {
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

		const client = new ApiClient(apiKey);

		try {
			const response = await client.listTags();

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
			} else {
				if (response.tags.length === 0) {
					console.log(pc.dim("No tags found."));
				} else {
					console.log(formatTagsTable(response.tags));
				}
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
