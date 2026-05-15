/**
 * zhe tags — List all tags (alias for `zhe tag list`)
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

/**
 * Shared implementation for `zhe tag list` and the legacy `zhe tags` alias.
 */
export async function runListTags({ json }: { json?: boolean }): Promise<void> {
	const apiKey = getApiKey();
	if (!apiKey) {
		console.log(pc.red("Not authenticated. Run `zhe login` first."));
		process.exit(EXIT_AUTH_REQUIRED);
	}

	const client = new ApiClient(apiKey);

	try {
		const response = await client.listTags();

		if (json) {
			console.log(JSON.stringify(response, null, 2));
		} else if (response.tags.length === 0) {
			console.log(pc.dim("No tags found."));
		} else {
			console.log(formatTagsTable(response.tags));
		}
	} catch (error) {
		handleListError(error);
	}
}

function handleListError(error: unknown): never {
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

export const tagsCommand = defineCommand({
	meta: {
		name: "tags",
		description: "List all tags (alias for `zhe tag list`)",
	},
	args: {
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		await runListTags({ json: args.json });
	},
});
