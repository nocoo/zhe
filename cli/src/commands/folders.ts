/**
 * zhe folders — List all folders
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
import { formatFoldersTable } from "../utils.js";

export const foldersCommand = defineCommand({
	meta: {
		name: "folders",
		description: "List all folders",
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
			const response = await client.listFolders();

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
			} else {
				if (response.folders.length === 0) {
					console.log(pc.dim("No folders found."));
				} else {
					console.log(formatFoldersTable(response.folders));
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
