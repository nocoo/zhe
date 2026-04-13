/**
 * zhe idea — Manage ideas (Markdown notes)
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
import type { CreateIdeaRequest, Tag, UpdateIdeaRequest } from "../api/types.js";
import { getApiKey } from "../config.js";
import { resolveTagName } from "../utils.js";

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
		if (error.status === 400) {
			console.log(pc.red(`Error: ${error.message}`));
		} else if (error.status === 404) {
			console.log(pc.red("Idea not found."));
			process.exit(EXIT_NOT_FOUND);
		} else {
			console.log(pc.red(`Error: ${error.message}`));
		}

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

function formatDate(isoDate: string): string {
	const date = new Date(isoDate);
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

function formatTags(tagIds: string[], tagMap?: Map<string, string>): string {
	if (!tagIds || tagIds.length === 0) return "";
	return tagIds
		.map((id) => `[${tagMap?.get(id) ?? id.slice(0, 8)}]`)
		.join(" ");
}

/**
 * Build a tagId→name map by fetching all tags from API.
 * Returns undefined on failure (display degrades to truncated IDs).
 */
async function buildTagMap(
	client: ApiClient,
	tagIds: string[],
): Promise<Map<string, string> | undefined> {
	if (tagIds.length === 0) return undefined;
	try {
		const { tags } = await client.listTags();
		return new Map(tags.map((t: Tag) => [t.id, t.name]));
	} catch {
		return undefined;
	}
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

const listSubcommand = defineCommand({
	meta: {
		name: "list",
		description: "List all ideas",
	},
	args: {
		limit: {
			type: "string",
			alias: "l",
			description: "Max results (default: 20)",
		},
		tag: {
			type: "string",
			alias: "t",
			description: "Filter by tag name",
		},
		query: {
			type: "string",
			alias: "q",
			description: "Search title and excerpt",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		try {
			// Resolve tag name to ID if provided
			let tagId: string | undefined;
			if (args.tag) {
				const resolved = await resolveTagName(client, args.tag);
				if (resolved === null) {
					process.exit(EXIT_INVALID_ARGS);
				}
				tagId = resolved;
			}

			const response = await client.listIdeas({
				limit: args.limit ? Number.parseInt(args.limit, 10) : 20,
				tagId,
				q: args.query,
			});

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
				return;
			}

			if (response.ideas.length === 0) {
				console.log(pc.yellow("No ideas found."));
				return;
			}

			// Build tag name map for display (like links' folder prefetch)
			const allTagIds = response.ideas.flatMap((i) => i.tagIds ?? []);
			const tagMap = await buildTagMap(client, allTagIds);

			// Table format
			console.log(
				pc.dim("ID    TIME             TITLE                    TAGS"),
			);
			console.log(pc.dim("─".repeat(56)));

			for (const idea of response.ideas) {
				const time = formatDate(idea.createdAt);
				const title = (idea.title || idea.excerpt || "(no content)").slice(
					0,
					24,
				);
				const tags = formatTags(idea.tagIds, tagMap);
				console.log(
					`${pc.cyan(String(idea.id).padEnd(6))}${time.padEnd(17)}${title.padEnd(25)}${pc.yellow(tags)}`,
				);
			}
		} catch (error) {
			handleApiError(error);
		}
	},
});

const getSubcommand = defineCommand({
	meta: {
		name: "get",
		description: "Get full content of an idea",
	},
	args: {
		id: {
			type: "positional",
			description: "Idea ID",
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

		const id = Number.parseInt(args.id as string, 10);
		if (Number.isNaN(id)) {
			console.log(pc.red("Invalid idea ID."));
			process.exit(EXIT_INVALID_ARGS);
		}

		try {
			const response = await client.getIdea(id);

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
				return;
			}

			const { idea } = response;
			const tagMap = await buildTagMap(client, idea.tagIds ?? []);
			const tags = formatTags(idea.tagIds, tagMap);
			const title = idea.title || formatDate(idea.createdAt);

			console.log(pc.dim("─".repeat(40)));
			console.log(`Idea ${pc.cyan(`#${idea.id}`)} — ${pc.bold(title)}`);
			if (tags) console.log(`Tags: ${pc.yellow(tags)}`);
			console.log(pc.dim("─".repeat(40)));
			console.log();
			console.log(idea.content);
		} catch (error) {
			handleApiError(error);
		}
	},
});

const addSubcommand = defineCommand({
	meta: {
		name: "add",
		description: "Create a new idea",
	},
	args: {
		content: {
			type: "positional",
			description: "Idea content (Markdown)",
			required: true,
		},
		title: {
			type: "string",
			alias: "t",
			description: "Optional title",
		},
		tag: {
			type: "string",
			alias: "T",
			description: "Add tag by name",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		const content = args.content as string;
		if (!content.trim()) {
			console.log(pc.red("Content cannot be empty."));
			process.exit(EXIT_INVALID_ARGS);
		}

		try {
			// Resolve tag name to ID if provided
			let tagIds: string[] | undefined;
			if (args.tag) {
				const tagId = await resolveTagName(client, args.tag);
				if (tagId === null) {
					process.exit(EXIT_INVALID_ARGS);
				}
				tagIds = [tagId];
			}

			const request: CreateIdeaRequest = {
				content,
				...(args.title && { title: args.title }),
				...(tagIds && { tagIds }),
			};

			const response = await client.createIdea(request);

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
				return;
			}

			const { idea } = response;
			const title = idea.title || formatDate(idea.createdAt);
			console.log(
				pc.green(`✓ Created idea ${pc.cyan(`#${idea.id}`)} (${title})`),
			);
		} catch (error) {
			handleApiError(error);
		}
	},
});

const updateSubcommand = defineCommand({
	meta: {
		name: "update",
		description: "Update an existing idea",
	},
	args: {
		id: {
			type: "positional",
			description: "Idea ID",
			required: true,
		},
		content: {
			type: "string",
			alias: "c",
			description: "New content",
		},
		title: {
			type: "string",
			alias: "t",
			description: "New title (use empty string to clear)",
		},
		tag: {
			type: "string",
			alias: "T",
			description: "Set tag by name (replaces all existing tags)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		const id = Number.parseInt(args.id as string, 10);
		if (Number.isNaN(id)) {
			console.log(pc.red("Invalid idea ID."));
			process.exit(EXIT_INVALID_ARGS);
		}

		// Build update request
		const request: UpdateIdeaRequest = {};
		if (args.content !== undefined) request.content = args.content;
		if (args.title !== undefined) {
			request.title = args.title === "" ? null : args.title;
		}

		// Resolve tag name if provided
		if (args.tag !== undefined) {
			if (args.tag === "") {
				// Empty string means clear all tags
				request.tagIds = [];
			} else {
				const tagId = await resolveTagName(client, args.tag);
				if (tagId === null) {
					process.exit(EXIT_INVALID_ARGS);
				}
				request.tagIds = [tagId];
			}
		}

		if (Object.keys(request).length === 0) {
			console.log(pc.yellow("No changes specified."));
			process.exit(EXIT_INVALID_ARGS);
		}

		try {
			const response = await client.updateIdea(id, request);

			if (args.json) {
				console.log(JSON.stringify(response, null, 2));
				return;
			}

			const { idea } = response;
			const title = idea.title || formatDate(idea.createdAt);
			console.log(
				pc.green(`✓ Updated idea ${pc.cyan(`#${idea.id}`)} (${title})`),
			);
		} catch (error) {
			handleApiError(error);
		}
	},
});

const deleteSubcommand = defineCommand({
	meta: {
		name: "delete",
		description: "Delete an idea",
	},
	args: {
		id: {
			type: "positional",
			description: "Idea ID",
			required: true,
		},
		yes: {
			type: "boolean",
			alias: "y",
			description: "Skip confirmation",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		const id = Number.parseInt(args.id as string, 10);
		if (Number.isNaN(id)) {
			console.log(pc.red("Invalid idea ID."));
			process.exit(EXIT_INVALID_ARGS);
		}

		try {
			// Only fetch idea for confirmation prompt (requires ideas:read)
			// With --yes flag, skip prefetch to allow write-only keys
			if (!args.yes) {
				const { idea } = await client.getIdea(id);
				const title = idea.title || formatDate(idea.createdAt);

				const confirmed = await confirm(`Delete idea #${id} (${title})?`);
				if (!confirmed) {
					console.log(pc.dim("Cancelled."));
					return;
				}
			}

			await client.deleteIdea(id);

			if (args.json) {
				console.log(JSON.stringify({ success: true, id }, null, 2));
				return;
			}

			console.log(pc.green(`✓ Deleted idea ${pc.cyan(`#${id}`)}`));
		} catch (error) {
			handleApiError(error);
		}
	},
});

// ── Main command ──

export const ideaCommand = defineCommand({
	meta: {
		name: "idea",
		description: "Manage ideas (Markdown notes)",
	},
	subCommands: {
		list: listSubcommand,
		get: getSubcommand,
		add: addSubcommand,
		update: updateSubcommand,
		delete: deleteSubcommand,
	},
});
