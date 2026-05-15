/**
 * zhe tag — Manage tags (create, update, delete, list)
 *
 * The plural `zhe tags` command (list-only) is preserved for back-compat;
 * `zhe tag list` is provided as the consistent alias.
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
import type { CreateTagRequest, UpdateTagRequest } from "../api/types.js";
import { getApiKey } from "../config.js";
import { formatTagsTable, resolveTagRef } from "../utils.js";

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
			console.log(pc.red("Tag not found."));
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

const HEX_COLOR_PATTERN = /^#?[0-9A-Fa-f]{6}$/;

/**
 * Validate hex color and normalize to `#rrggbb` form.
 * Returns null with an error printed if invalid.
 */
function normalizeColor(input: string): string | null {
	if (!HEX_COLOR_PATTERN.test(input)) {
		console.log(
			pc.red(
				"--color must be a 6-digit hex color (e.g. '#3b82f6' or 'ff5500').",
			),
		);
		return null;
	}
	return input.startsWith("#") ? input : `#${input}`;
}

// ── Subcommands ──

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
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		try {
			const response = await client.listTags();

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
				return;
			}

			if (response.tags.length === 0) {
				console.log(pc.dim("No tags found."));
				return;
			}
			console.log(formatTagsTable(response.tags));
		} catch (error) {
			handleApiError(error);
		}
	},
});

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
			description: "Tag color as 6-digit hex (e.g. '#3b82f6' or 'ff5500')",
			required: true,
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
			console.log(pc.red("Tag name cannot be empty."));
			process.exit(EXIT_INVALID_ARGS);
		}

		const color = normalizeColor(args.color as string);
		if (color === null) {
			process.exit(EXIT_INVALID_ARGS);
		}

		const request: CreateTagRequest = { name, color };

		try {
			const response = await client.createTag(request);

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
				return;
			}

			const { tag } = response;
			console.log(
				pc.green(
					`✓ Created tag ${pc.cyan(tag.name)} ${pc.dim(`(${tag.id})`)} ${tag.color}`,
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
		description: "Update a tag (rename or change color)",
	},
	args: {
		ref: {
			type: "positional",
			description: "Tag name or UUID",
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
			description: "New color as 6-digit hex (e.g. '#3b82f6' or 'ff5500')",
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

		const request: UpdateTagRequest = {};
		if (args.name !== undefined) {
			const trimmed = (args.name as string).trim();
			if (!trimmed) {
				console.log(pc.red("--name cannot be empty."));
				process.exit(EXIT_INVALID_ARGS);
			}
			request.name = trimmed;
		}
		if (args.color !== undefined) {
			const color = normalizeColor(args.color as string);
			if (color === null) {
				process.exit(EXIT_INVALID_ARGS);
			}
			request.color = color;
		}

		if (Object.keys(request).length === 0) {
			console.log(
				pc.yellow("No changes specified. Pass --name and/or --color."),
			);
			process.exit(EXIT_INVALID_ARGS);
		}

		try {
			const resolved = await resolveTagRef(client, ref);
			if (resolved.kind === "not_found") {
				console.log(pc.red(`Tag not found: ${ref}.`));
				process.exit(EXIT_NOT_FOUND);
			}
			if (resolved.kind === "ambiguous") {
				console.log(
					pc.red(
						`Multiple tags match "${ref}". Please use the tag ID or rename duplicates.`,
					),
				);
				process.exit(EXIT_INVALID_ARGS);
			}

			const response = await client.updateTag(resolved.id, request);

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
				return;
			}

			const { tag } = response;
			console.log(
				pc.green(
					`✓ Updated tag ${pc.cyan(tag.name)} ${pc.dim(`(${tag.id})`)} ${tag.color}`,
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
		description: "Delete a tag",
	},
	args: {
		ref: {
			type: "positional",
			description: "Tag name or UUID",
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
			const resolved = await resolveTagRef(client, ref);
			if (resolved.kind === "not_found") {
				console.log(pc.red(`Tag not found: ${ref}.`));
				process.exit(EXIT_NOT_FOUND);
			}
			if (resolved.kind === "ambiguous") {
				console.log(
					pc.red(
						`Multiple tags match "${ref}". Please use the tag ID or rename duplicates.`,
					),
				);
				process.exit(EXIT_INVALID_ARGS);
			}

			const { id: tagId, name: tagName } = resolved;

			if (!args.yes) {
				if (!process.stdin.isTTY) {
					console.log(
						pc.red("Refusing to delete without --yes in non-interactive mode."),
					);
					process.exit(EXIT_INVALID_ARGS);
				}
				const confirmed = await confirm(`Delete tag "${tagName}" (${tagId})?`);
				if (!confirmed) {
					console.log(pc.dim("Cancelled."));
					return;
				}
			}

			await client.deleteTag(tagId);

			if (args.json) {
				console.log(
					JSON.stringify({ success: true, id: tagId, name: tagName }, null, 2),
				);
				return;
			}

			console.log(
				pc.green(`✓ Deleted tag ${pc.cyan(tagName)} ${pc.dim(`(${tagId})`)}`),
			);
		} catch (error) {
			handleApiError(error);
		}
	},
});

// ── Main command ──

export const tagCommand = defineCommand({
	meta: {
		name: "tag",
		description: "Manage tags (create, update, delete, list)",
	},
	subCommands: {
		create: createSubcommand,
		update: updateSubcommand,
		delete: deleteSubcommand,
		list: listSubcommand,
	},
});
