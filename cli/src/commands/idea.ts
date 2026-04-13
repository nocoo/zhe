/**
 * zhe idea — Manage ideas (Markdown notes)
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
import type {
	CreateIdeaRequest,
	IdeaListItem,
	Tag,
	UpdateIdeaRequest,
} from "../api/types.js";
import { getApiKey } from "../config.js";

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

function formatTags(tags: Tag[]): string {
	if (tags.length === 0) return "";
	return tags.map((t) => `[${t.name}]`).join(" ");
}

/**
 * Resolve tag names to tag IDs via API.
 * Returns null if any tag is not found (with error message printed).
 */
async function resolveTagNames(
	client: ApiClient,
	tagNames: string[],
): Promise<string[] | null> {
	if (tagNames.length === 0) return [];

	const { tags } = await client.listTags();
	const tagIds: string[] = [];
	const notFound: string[] = [];

	for (const name of tagNames) {
		const tag = tags.find(
			(t: Tag) => t.name.toLowerCase() === name.toLowerCase(),
		);
		if (tag) {
			tagIds.push(tag.id);
		} else {
			notFound.push(name);
		}
	}

	if (notFound.length > 0) {
		console.log(
			pc.red(`Tag not found: ${notFound.join(", ")}. Create it first.`),
		);
		return null;
	}

	return tagIds;
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
				const tagIds = await resolveTagNames(client, [args.tag]);
				if (tagIds === null) {
					process.exit(EXIT_INVALID_ARGS);
				}
				tagId = tagIds[0];
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
				const tags = formatTags(idea.tags);
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
			const tags = formatTags(idea.tags);
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
			description: "Add tag by name (repeatable)",
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
			// Resolve tag names to IDs
			const tagNames = Array.isArray(args.tag)
				? args.tag
				: args.tag
					? [args.tag]
					: [];
			const tagIds = await resolveTagNames(client, tagNames);
			if (tagIds === null) {
				process.exit(EXIT_INVALID_ARGS);
			}

			const request: CreateIdeaRequest = {
				content,
				...(args.title && { title: args.title }),
				...(tagIds.length > 0 && { tagIds }),
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
			description: "Set tags by name (replaces all, repeatable)",
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

		// Resolve tag names if provided
		const tagNames = Array.isArray(args.tag)
			? args.tag
			: args.tag
				? [args.tag]
				: [];
		if (tagNames.length > 0) {
			const tagIds = await resolveTagNames(client, tagNames);
			if (tagIds === null) {
				process.exit(EXIT_INVALID_ARGS);
			}
			request.tagIds = tagIds;
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
			// Get idea first to show info
			const { idea } = await client.getIdea(id);
			const title = idea.title || formatDate(idea.createdAt);

			if (!args.yes) {
				console.log(
					pc.yellow(`Are you sure you want to delete idea #${id} (${title})?`),
				);
				console.log(pc.dim("Run with --yes to skip this prompt."));
				process.exit(0);
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
	args: {
		content: {
			type: "positional",
			description: "Quick-add: content for a new idea",
			required: false,
		},
		tag: {
			type: "string",
			alias: "T",
			description: "Add tag by name (for quick-add)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON (for quick-add)",
		},
	},
	subCommands: {
		list: listSubcommand,
		get: getSubcommand,
		add: addSubcommand,
		update: updateSubcommand,
		delete: deleteSubcommand,
	},
	async run({ args }) {
		// If content is provided as positional arg, do quick-add
		if (args.content) {
			// Delegate to add subcommand logic
			const apiKey = requireAuth();
			const client = new ApiClient(apiKey);

			const content = args.content as string;
			if (!content.trim()) {
				console.log(pc.red("Content cannot be empty."));
				process.exit(EXIT_INVALID_ARGS);
			}

			try {
				// Resolve tag names to IDs
				const tagNames = Array.isArray(args.tag)
					? args.tag
					: args.tag
						? [args.tag]
						: [];
				const tagIds = await resolveTagNames(client, tagNames);
				if (tagIds === null) {
					process.exit(EXIT_INVALID_ARGS);
				}

				const request: CreateIdeaRequest = {
					content,
					...(tagIds.length > 0 && { tagIds }),
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
		} else {
			// Show help
			console.log("Usage: zhe idea <content>       Quick-add an idea");
			console.log("       zhe idea add [options]   Create with options");
			console.log("       zhe idea list [options]  List all ideas");
			console.log("       zhe idea get <id>        Get full content");
			console.log("       zhe idea update <id>     Update an idea");
			console.log("       zhe idea delete <id>     Delete an idea");
			console.log();
			console.log("Run `zhe idea <command> --help` for more info.");
		}
	},
});
