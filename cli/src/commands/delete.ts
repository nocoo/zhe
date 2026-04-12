/**
 * zhe delete <id> — Delete a link
 */

import * as readline from "node:readline";
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
import { getApiKey } from "../config.js";
import { parseLinkId } from "../utils.js";

export const deleteCommand = defineCommand({
	meta: {
		name: "delete",
		description: "Delete a link",
	},
	args: {
		id: {
			type: "positional",
			description: "Link ID (numeric)",
			required: true,
		},
		yes: {
			type: "boolean",
			alias: "y",
			description: "Skip confirmation prompt",
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

		// Confirmation prompt unless --yes flag
		if (!args.yes) {
			const confirmed = await confirm(`Delete link #${id}?`);
			if (!confirmed) {
				console.log(pc.dim("Cancelled."));
				return;
			}
		}

		const client = new ApiClient(apiKey);

		try {
			await client.deleteLink(id);

			if (args.json) {
				console.log(JSON.stringify({ success: true }));
			} else {
				console.log(pc.green("✓ Deleted"));
			}
		} catch (error) {
			handleApiError(error);
		}
	},
});

async function confirm(message: string): Promise<boolean> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		rl.question(`${message} [y/N] `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y");
		});
	});
}

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
