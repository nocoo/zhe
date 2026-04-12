/**
 * zhe login — Authenticate with API Key
 */

import * as readline from "node:readline";
import { defineCommand, pc } from "@nocoo/cli-base";
import { ApiClient, EXIT_AUTH_REQUIRED, EXIT_ERROR } from "../api/client.js";
import { getApiKey, saveApiKey } from "../config.js";
import { isValidApiKeyFormat, maskApiKey } from "../utils.js";

export const loginCommand = defineCommand({
	meta: {
		name: "login",
		description: "Authenticate with API Key",
	},
	async run() {
		// Check if already logged in
		const existingKey = getApiKey();
		if (existingKey) {
			console.log(
				pc.yellow(`Already logged in with API Key: ${maskApiKey(existingKey)}`),
			);
			console.log(pc.dim("Run `zhe logout` first to switch accounts."));
			return;
		}

		// Prompt for API key
		const apiKey = await promptForApiKey();

		if (!apiKey) {
			console.log(pc.red("No API Key provided."));
			process.exit(EXIT_AUTH_REQUIRED);
		}

		// Validate format
		if (!isValidApiKeyFormat(apiKey)) {
			console.log(pc.red("✗ Invalid API Key format"));
			console.log(pc.dim("API Key must start with 'zhe_'"));
			process.exit(EXIT_AUTH_REQUIRED);
		}

		// Test the key
		console.log(pc.dim("Verifying API Key..."));
		const client = new ApiClient(apiKey);

		try {
			const valid = await client.verifyKey();
			if (!valid) {
				console.log(pc.red("✗ Invalid API Key"));
				console.log();
				console.log(
					`To create an API Key, visit: ${pc.cyan("https://zhe.to/dashboard/api-keys")}`,
				);
				process.exit(EXIT_AUTH_REQUIRED);
			}
		} catch (error) {
			console.log(pc.red("✗ Failed to verify API Key"));
			if (error instanceof Error) {
				console.log(pc.dim(error.message));
			}
			process.exit(EXIT_ERROR);
		}

		// Save the key
		saveApiKey(apiKey);

		console.log(pc.green("✓ API Key saved (read access verified)"));
		console.log(`  API Key: ${pc.cyan(maskApiKey(apiKey))}`);
		console.log();
		console.log(pc.dim("Note: Write operations require `links:write` scope."));
		console.log(
			`To create an API Key, visit: ${pc.cyan("https://zhe.to/dashboard/api-keys")}`,
		);
	},
});

async function promptForApiKey(): Promise<string> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		// Hide input for security
		const stdin = process.stdin;
		const originalRawMode = stdin.isRaw;

		process.stdout.write("Enter your API Key: ");

		if (stdin.isTTY) {
			stdin.setRawMode(true);
		}

		let input = "";

		const onData = (char: Buffer) => {
			const c = char.toString();

			if (c === "\n" || c === "\r") {
				// Enter pressed
				if (stdin.isTTY) {
					stdin.setRawMode(originalRawMode ?? false);
				}
				stdin.removeListener("data", onData);
				process.stdout.write("\n");
				rl.close();
				resolve(input.trim());
			} else if (c === "\u0003") {
				// Ctrl+C
				if (stdin.isTTY) {
					stdin.setRawMode(originalRawMode ?? false);
				}
				process.stdout.write("\n");
				process.exit(0);
			} else if (c === "\u007F" || c === "\b") {
				// Backspace
				if (input.length > 0) {
					input = input.slice(0, -1);
				}
			} else if (c.charCodeAt(0) >= 32) {
				// Printable character
				input += c;
				process.stdout.write("*");
			}
		};

		stdin.on("data", onData);
		stdin.resume();
	});
}
