/**
 * zhe open <slug> — Open short URL in browser
 */

import { defineCommand, pc } from "@nocoo/cli-base";
import { EXIT_INVALID_ARGS } from "../api/client.js";
import { openInBrowser } from "../utils.js";

const BASE_URL = "https://zhe.to";

export const openCommand = defineCommand({
	meta: {
		name: "open",
		description: "Open short URL in browser",
	},
	args: {
		slug: {
			type: "positional",
			description: "The slug to open",
			required: true,
		},
	},
	run({ args }) {
		const slug = args.slug as string;

		if (!slug || slug.length === 0) {
			console.log(pc.red("Slug is required."));
			process.exit(EXIT_INVALID_ARGS);
		}

		const url = `${BASE_URL}/${slug}`;

		console.log(`Opening ${pc.cyan(url)}...`);
		openInBrowser(url);
	},
});
