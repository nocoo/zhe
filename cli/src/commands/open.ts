/**
 * zhe open <slug> — Open short URL in browser
 */

import { exec } from "node:child_process";
import { defineCommand, pc } from "@nocoo/cli-base";
import { EXIT_INVALID_ARGS } from "../api/client.js";

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

function openInBrowser(url: string): void {
	const platform = process.platform;
	let command: string;

	if (platform === "darwin") {
		command = `open "${url}"`;
	} else if (platform === "linux") {
		command = `xdg-open "${url}"`;
	} else if (platform === "win32") {
		command = `start "" "${url}"`;
	} else {
		console.log(pc.dim(`Unable to open browser on ${platform}. Visit: ${url}`));
		return;
	}

	exec(command, (error) => {
		if (error) {
			console.log(pc.dim(`Failed to open browser. Visit: ${url}`));
		}
	});
}
