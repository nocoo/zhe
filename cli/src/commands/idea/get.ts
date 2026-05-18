import { defineCommand, pc } from "@nocoo/cli-base";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import { parsePositiveInt } from "../../utils.js";
import {
	buildTagMap,
	formatDate,
	formatTags,
	handleApiError,
	requireAuth,
} from "./helpers.js";

export const getSubcommand = defineCommand({
	meta: {
		name: "get",
		description: "Get full content of an idea",
	},
	args: {
		id: { type: "positional", description: "Idea ID", required: true },
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
