/**
 * zhe create <url> — Create a new short link
 */

import { exec } from "node:child_process";
import { defineCommand, pc } from "@nocoo/cli-base";
import {
	ApiClient,
	ApiClientError,
	EXIT_AUTH_REQUIRED,
	EXIT_ERROR,
	EXIT_INVALID_ARGS,
	EXIT_RATE_LIMITED,
} from "../api/client.js";
import type { CreateLinkRequest, Folder } from "../api/types.js";
import { getApiKey } from "../config.js";

export const createCommand = defineCommand({
	meta: {
		name: "create",
		description: "Create a new short link",
	},
	args: {
		url: {
			type: "positional",
			description: "The URL to shorten",
			required: true,
		},
		slug: {
			type: "string",
			alias: "s",
			description: "Custom slug (auto-generated if not provided)",
		},
		folder: {
			type: "string",
			alias: "f",
			description: "Folder ID",
		},
		note: {
			type: "string",
			alias: "n",
			description: "Note/description",
		},
		expires: {
			type: "string",
			alias: "e",
			description: "Expiration date (ISO 8601)",
		},
		copy: {
			type: "boolean",
			description: "Copy short URL to clipboard",
		},
		open: {
			type: "boolean",
			description: "Open short URL in browser",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
		},
	},
	async run({ args }) {
		const apiKey = getApiKey();
		if (!apiKey) {
			console.log(pc.red("Not authenticated. Run `zhe login` first."));
			process.exit(EXIT_AUTH_REQUIRED);
		}

		const url = args.url as string;

		// Basic URL validation
		if (!isValidUrl(url)) {
			console.log(pc.red("Invalid URL format. Include protocol (https://)."));
			process.exit(EXIT_INVALID_ARGS);
		}

		const client = new ApiClient(apiKey);

		try {
			// Build request object, only including defined fields
			const createRequest: CreateLinkRequest = { url };
			if (args.slug) createRequest.slug = args.slug;
			if (args.folder) createRequest.folderId = args.folder;
			if (args.note) createRequest.note = args.note;
			if (args.expires) createRequest.expiresAt = args.expires;

			const response = await client.createLink(createRequest);

			const shortUrl = response.link.shortUrl;

			// Handle clipboard
			let copied = false;
			if (args.copy) {
				copied = await copyToClipboard(shortUrl);
			}

			// Handle open in browser
			if (args.open) {
				openInBrowser(shortUrl);
			}

			// Output
			if (args.json) {
				// If link has folderId, fetch folder name for enriched JSON output
				if (response.link.folderId) {
					try {
						const foldersResponse = await client.listFolders();
						const folder = foldersResponse.folders.find(
							(f: Folder) => f.id === response.link.folderId,
						);
						if (folder) {
							// Add folderName to JSON output
							const enrichedResponse = {
								...response,
								link: {
									...response.link,
									folderName: folder.name,
								},
							};
							console.log(JSON.stringify(enrichedResponse, null, 2));
							return;
						}
					} catch {
						// If folder fetch fails, continue with original response
					}
				}
				console.log(JSON.stringify(response, null, 2));
			} else {
				const suffix = copied ? " (copied to clipboard)" : "";
				let folderInfo = "";
				// If link has folderId, fetch and display folder name
				if (response.link.folderId) {
					try {
						const foldersResponse = await client.listFolders();
						const folder = foldersResponse.folders.find(
							(f: Folder) => f.id === response.link.folderId,
						);
						if (folder) {
							folderInfo = ` in ${pc.yellow(folder.name)}`;
						}
					} catch {
						// If folder fetch fails, show folder ID as fallback
						folderInfo = ` in folder ${response.link.folderId}`;
					}
				}
				console.log(
					pc.green(`✓ Created ${pc.cyan(shortUrl)}${folderInfo}${suffix}`),
				);
			}
		} catch (error) {
			handleApiError(error);
		}
	},
});

function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

async function copyToClipboard(text: string): Promise<boolean> {
	return new Promise((resolve) => {
		const platform = process.platform;
		let command: string;

		if (platform === "darwin") {
			command = "pbcopy";
		} else if (platform === "linux") {
			command = "xclip -selection clipboard";
		} else if (platform === "win32") {
			command = "clip";
		} else {
			resolve(false);
			return;
		}

		const child = exec(command, (error) => {
			resolve(!error);
		});
		child.stdin?.write(text);
		child.stdin?.end();
	});
}

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
		return;
	}

	exec(command);
}

function handleApiError(error: unknown): never {
	if (error instanceof ApiClientError) {
		// Provide specific error messages
		if (error.status === 409) {
			console.log(pc.red("Slug is already in use."));
		} else if (error.status === 400) {
			console.log(pc.red(`Error: ${error.message}`));
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
