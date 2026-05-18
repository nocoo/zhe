import { defineCommand, pc } from "@nocoo/cli-base";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import { parsePositiveInt } from "../../utils.js";
import { confirm, formatDate, handleApiError, requireAuth } from "./helpers.js";

export const deleteSubcommand = defineCommand({
	meta: {
		name: "delete",
		description: "Delete an idea",
	},
	args: {
		id: { type: "positional", description: "Idea ID", required: true },
		yes: { type: "boolean", alias: "y", description: "Skip confirmation" },
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
			// Only fetch idea for confirmation prompt (requires ideas:read).
			// With --yes flag, skip prefetch to allow write-only keys.
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
