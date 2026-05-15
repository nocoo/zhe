/**
 * zhe folder — Manage folders (create, update, delete)
 *
 * The plural `zhe folders` command (list-only) is preserved for back-compat.
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
import type { CreateFolderRequest, UpdateFolderRequest } from "../api/types.js";
import { getApiKey } from "../config.js";
import { resolveFolderName } from "../utils.js";

// ── Helpers ──

function requireAuth(): string {
	const apiKey = getApiKey();
	if (!apiKey) {
		console.log(pc.red("Not authenticated. Run `zhe login` first."));
		process.exit(EXIT_AUTH_REQUIRED);
	}
	return apiKey;
}

function handleApiError(error: unknown): never {
	if (error instanceof ApiClientError) {
		if (error.status === 404) {
			console.log(pc.red("Folder not found."));
			process.exit(EXIT_NOT_FOUND);
		}
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

// ── Subcommands ──

const createSubcommand = defineCommand({
	meta: {
		name: "create",
		description: "Create a new folder",
	},
	args: {
		name: {
			type: "positional",
			description: "Folder name",
			required: true,
		},
		icon: {
			type: "string",
			alias: "i",
			description: "Folder icon (emoji or label)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		const name = (args.name as string).trim();
		if (!name) {
			console.log(pc.red("Folder name cannot be empty."));
			process.exit(EXIT_INVALID_ARGS);
		}

		const request: CreateFolderRequest = {
			name,
			...(args.icon ? { icon: args.icon } : {}),
		};

		try {
			const response = await client.createFolder(request);

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
				return;
			}

			const { folder } = response;
			console.log(
				pc.green(
					`✓ Created folder ${pc.cyan(folder.name)} ${pc.dim(`(${folder.id})`)}`,
				),
			);
		} catch (error) {
			handleApiError(error);
		}
	},
});

const updateSubcommand = defineCommand({
	meta: {
		name: "update",
		description: "Update a folder (rename or change icon)",
	},
	args: {
		ref: {
			type: "positional",
			description: "Folder name or UUID",
			required: true,
		},
		name: {
			type: "string",
			alias: "n",
			description: "New folder name",
		},
		icon: {
			type: "string",
			alias: "i",
			description: "New icon (emoji or label)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		const ref = args.ref as string;

		const request: UpdateFolderRequest = {};
		if (args.name !== undefined) {
			const trimmed = (args.name as string).trim();
			if (!trimmed) {
				console.log(pc.red("--name cannot be empty."));
				process.exit(EXIT_INVALID_ARGS);
			}
			request.name = trimmed;
		}
		if (args.icon !== undefined) {
			request.icon = args.icon as string;
		}

		if (Object.keys(request).length === 0) {
			console.log(
				pc.yellow("No changes specified. Pass --name and/or --icon."),
			);
			process.exit(EXIT_INVALID_ARGS);
		}

		try {
			const folderId = await resolveFolderName(client, ref);
			if (folderId === null) {
				process.exit(EXIT_NOT_FOUND);
			}

			const response = await client.updateFolder(folderId, request);

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
				return;
			}

			const { folder } = response;
			console.log(
				pc.green(
					`✓ Updated folder ${pc.cyan(folder.name)} ${pc.dim(`(${folder.id})`)}`,
				),
			);
		} catch (error) {
			handleApiError(error);
		}
	},
});

const deleteSubcommand = defineCommand({
	meta: {
		name: "delete",
		description: "Delete a folder",
	},
	args: {
		ref: {
			type: "positional",
			description: "Folder name or UUID",
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
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		const ref = args.ref as string;

		try {
			const folderId = await resolveFolderName(client, ref);
			if (folderId === null) {
				process.exit(EXIT_NOT_FOUND);
			}

			if (!args.yes) {
				if (!process.stdin.isTTY) {
					console.log(
						pc.red("Refusing to delete without --yes in non-interactive mode."),
					);
					process.exit(EXIT_INVALID_ARGS);
				}
				const confirmed = await confirm(
					`Delete folder "${ref}" (${folderId})?`,
				);
				if (!confirmed) {
					console.log(pc.dim("Cancelled."));
					return;
				}
			}

			await client.deleteFolder(folderId);

			if (args.json) {
				console.log(JSON.stringify({ success: true, id: folderId }, null, 2));
				return;
			}

			console.log(pc.green(`✓ Deleted folder ${pc.dim(`(${folderId})`)}`));
		} catch (error) {
			handleApiError(error);
		}
	},
});

// ── Main command ──

export const folderCommand = defineCommand({
	meta: {
		name: "folder",
		description: "Manage folders (create, update, delete)",
	},
	subCommands: {
		create: createSubcommand,
		update: updateSubcommand,
		delete: deleteSubcommand,
	},
});
