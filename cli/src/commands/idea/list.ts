import { defineCommand, pc } from "@nocoo/cli-base";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import { resolveTagName } from "../../utils.js";
import {
	buildTagMap,
	formatDate,
	formatTags,
	handleApiError,
	requireAuth,
} from "./helpers.js";

export const listSubcommand = defineCommand({
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
		tag: { type: "string", alias: "t", description: "Filter by tag name" },
		query: {
			type: "string",
			alias: "q",
			description: "Search title and excerpt",
		},
		json: { type: "boolean", description: "Output as JSON" },
	},
	async run({ args }) {
		const apiKey = requireAuth();
		const client = new ApiClient(apiKey);

		try {
			let tagId: string | undefined;
			if (args.tag) {
				const resolved = await resolveTagName(client, args.tag);
				if (resolved === null) process.exit(EXIT_INVALID_ARGS);
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

			const allTagIds = response.ideas.flatMap((i) => i.tagIds ?? []);
			const tagMap = await buildTagMap(client, allTagIds);

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
