/**
 * zhe idea — Manage ideas (Markdown notes).
 *
 * Subcommand implementations live in ./idea/*.ts to keep this file small.
 * `formatTags` is re-exported here for tests that import from
 * `commands/idea.js`.
 */

import { defineCommand } from "@nocoo/cli-base";
import { addSubcommand } from "./idea/add.js";
import { deleteSubcommand } from "./idea/delete.js";
import { getSubcommand } from "./idea/get.js";
import { listSubcommand } from "./idea/list.js";
import { updateSubcommand } from "./idea/update.js";

export { formatTags } from "./idea/helpers.js";

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
