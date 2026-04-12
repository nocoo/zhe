/**
 * zhe inbox — List uncategorized links (no folder)
 */

import { defineCommand, pc } from "@nocoo/cli-base";
import {
	ApiClient,
	ApiClientError,
	EXIT_AUTH_REQUIRED,
	EXIT_ERROR,
	EXIT_RATE_LIMITED,
} from "../api/client.js";
import { getApiKey, getOutputFormat } from "../config.js";
import { formatLinksMinimal, formatLinksTable } from "../utils.js";

export const inboxCommand = defineCommand({
	meta: {
		name: "inbox",
		description: "List uncategorized links (no folder)",
	},
	args: {
		limit: {
			type: "string",
			alias: "l",
			description: "Max results (default: 50, max: 500)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
		minimal: {
			type: "boolean",
			description: "Output short URLs only",
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
			const params = {
				inbox: true,
				...(args.limit ? { limit: Number.parseInt(args.limit, 10) } : {}),
			};

			const response = await client.listLinks(params);

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
					if (response.links.length === 0) {
						console.log(pc.dim("No uncategorized links found."));
					} else {
						console.log(formatLinksTable(response.links));
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
