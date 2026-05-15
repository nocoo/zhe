/**
 * zhe tag — Manage tags (create/update/delete/list)
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
import type { UpdateTagRequest } from "../api/types.js";
import { getApiKey } from "../config.js";
import { normalizeHexColor, resolveTagName } from "../utils.js";
import { runListTags } from "./tags.js";

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
		if (error.status === 409) {
			console.log(pc.red("A tag with that name already exists."));
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

/**
 * Interactive y/N prompt. Resolves true on "y" / "Y" only.
 * Throws if stdin is not a TTY (caller should require --yes for non-TTY).
 */
async function confirm(message: string): Promise<boolean> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		rl.question(`${message} (y/N) `, (answer) => {
			rl.close();
			resolve(answer.trim().toLowerCase() === "y");
		});
	});
}

// ── Subcommands ──

const createSubcommand = defineCommand({
	meta: {
		name: "create",
		description: "Create a new tag",
	},
	args: {
		name: {
			type: "positional",
			description: "Tag name",
			required: true,
		},
		color: {
			type: "string",
			alias: "c",
			description: "Tag color as 6-digit hex (with or without leading #)",
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
		if (name.length === 0) {
			console.log(pc.red("Tag name cannot be empty."));
			process.exit(EXIT_INVALID_ARGS);
		}

		// Default to a neutral slate color when --color is omitted, matching
		// the web UI's default new-tag color.
		const colorInput = args.color ?? "#94a3b8";
		const color = normalizeHexColor(colorInput);
		if (color === null) {
			console.log(
				pc.red(
					`Invalid color: ${colorInput}. Must be a 6-digit hex color (e.g. "3b82f6" or "#3b82f6").`,
				),
			);
			process.exit(EXIT_INVALID_ARGS);
		}

		try {
			const response = await client.createTag({ name, color });

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
			} else {
				console.log(
					pc.green(
						`✓ Created tag "${response.tag.name}" (${response.tag.color})`,
					),
				);
				console.log(pc.dim(`  ID: ${response.tag.id}`));
			}
		} catch (error) {
			handleApiError(error);
		}
	},
});

const updateSubcommand = defineCommand({
	meta: {
		name: "update",
		description: "Update an existing tag",
	},
	args: {
		ref: {
			type: "positional",
			description: "Tag name or ID",
			required: true,
		},
		name: {
			type: "string",
			alias: "n",
			description: "New tag name",
		},
		color: {
			type: "string",
			alias: "c",
			description: "New tag color as 6-digit hex (with or without leading #)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		const data: UpdateTagRequest = {};

		if (args.name !== undefined) {
			const trimmed = args.name.trim();
			if (trimmed.length === 0) {
				console.log(pc.red("Tag name cannot be empty."));
				process.exit(EXIT_INVALID_ARGS);
			}
			data.name = trimmed;
		}

		if (args.color !== undefined) {
			const color = normalizeHexColor(args.color);
			if (color === null) {
				console.log(
					pc.red(
						`Invalid color: ${args.color}. Must be a 6-digit hex color (e.g. "3b82f6" or "#3b82f6").`,
					),
				);
				process.exit(EXIT_INVALID_ARGS);
			}
			data.color = color;
		}

		if (Object.keys(data).length === 0) {
			console.log(pc.yellow("No changes specified."));
			console.log(pc.dim("Use --name or --color"));
			process.exit(EXIT_INVALID_ARGS);
		}

		const tagId = await resolveTagName(client, args.ref as string, {
			notFoundMessage: `Tag not found: ${args.ref}`,
		});
		if (tagId === null) {
			process.exit(EXIT_NOT_FOUND);
		}

		try {
			const response = await client.updateTag(tagId, data);

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
			} else {
				console.log(
					pc.green(
						`✓ Updated tag "${response.tag.name}" (${response.tag.color})`,
					),
				);
			}
		} catch (error) {
			handleApiError(error);
		}
	},
});

const deleteSubcommand = defineCommand({
	meta: {
		name: "delete",
		description: "Delete a tag",
	},
	args: {
		ref: {
			type: "positional",
			description: "Tag name or ID",
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

		const tagId = await resolveTagName(client, args.ref as string, {
			notFoundMessage: `Tag not found: ${args.ref}`,
		});
		if (tagId === null) {
			process.exit(EXIT_NOT_FOUND);
		}

		// Prefer showing the original name in the prompt; fall back to the ref
		// (which is already the name when input wasn't a UUID).
		const displayName = args.ref as string;

		if (!args.yes) {
			if (!process.stdin.isTTY) {
				console.log(
					pc.red(
						"Refusing to delete without confirmation in a non-interactive shell. Pass --yes to confirm.",
					),
				);
				process.exit(EXIT_INVALID_ARGS);
			}
			const ok = await confirm(`Delete tag "${displayName}"?`);
			if (!ok) {
				console.log(pc.dim("Cancelled."));
				return;
			}
		}

		try {
			await client.deleteTag(tagId);

			if (args.json) {
				console.log(JSON.stringify({ success: true, id: tagId }));
			} else {
				console.log(pc.green(`✓ Deleted tag "${displayName}"`));
			}
		} catch (error) {
			handleApiError(error);
		}
	},
});

const listSubcommand = defineCommand({
	meta: {
		name: "list",
		description: "List all tags",
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

// ── Main command ──

export const tagCommand = defineCommand({
	meta: {
		name: "tag",
		description: "Manage tags (create/update/delete/list)",
	},
	subCommands: {
		create: createSubcommand,
		update: updateSubcommand,
		delete: deleteSubcommand,
		list: listSubcommand,
	},
});
