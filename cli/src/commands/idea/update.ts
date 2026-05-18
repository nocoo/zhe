import { defineCommand, pc } from "@nocoo/cli-base";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import type { UpdateIdeaRequest } from "../../api/types.js";
import { parsePositiveInt, resolveTagName } from "../../utils.js";
import { formatDate, handleApiError, requireAuth } from "./helpers.js";

/** Parse CLI args into an UpdateIdeaRequest, exiting on invalid tag input. */
async function buildUpdateRequest(
	client: ApiClient,
	args: { content?: string; title?: string; tag?: string },
): Promise<UpdateIdeaRequest> {
	const request: UpdateIdeaRequest = {};
	if (args.content !== undefined) request.content = args.content;
	if (args.title !== undefined) {
		request.title = args.title === "" ? null : args.title;
	}
	if (args.tag !== undefined) {
		if (args.tag === "") {
			request.tagIds = [];
		} else {
			const tagId = await resolveTagName(client, args.tag);
			if (tagId === null) process.exit(EXIT_INVALID_ARGS);
			request.tagIds = [tagId];
		}
	}
	return request;
}

export const updateSubcommand = defineCommand({
	meta: {
		name: "update",
		description: "Update an existing idea",
	},
	args: {
		id: { type: "positional", description: "Idea ID", required: true },
		content: { type: "string", alias: "c", description: "New content" },
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
		json: { type: "boolean", description: "Output as JSON" },
	},
	async run({ args }) {
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		const id = parsePositiveInt(args.id as string);
		if (id === null) {
			console.log(pc.red("Invalid idea ID."));
			process.exit(EXIT_INVALID_ARGS);
		}

		const request = await buildUpdateRequest(client, {
			content: args.content as string | undefined,
			title: args.title as string | undefined,
			tag: args.tag as string | undefined,
		});

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
