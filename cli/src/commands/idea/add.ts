import { defineCommand, pc } from "@nocoo/cli-base";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import type { CreateIdeaRequest } from "../../api/types.js";
import { resolveTagName } from "../../utils.js";
import { formatDate, handleApiError, requireAuth } from "./helpers.js";

export const addSubcommand = defineCommand({
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
		title: { type: "string", alias: "t", description: "Optional title" },
		tag: { type: "string", alias: "T", description: "Add tag by name" },
		json: { type: "boolean", description: "Output as JSON" },
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
			let tagIds: string[] | undefined;
			if (args.tag) {
				const tagId = await resolveTagName(client, args.tag);
				if (tagId === null) process.exit(EXIT_INVALID_ARGS);
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
