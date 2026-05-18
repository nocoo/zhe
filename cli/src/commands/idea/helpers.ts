/** Shared helpers for the `zhe idea` subcommands. */

import * as readline from "node:readline";
import { pc } from "@nocoo/cli-base";
import {
	ApiClient,
	ApiClientError,
	EXIT_AUTH_REQUIRED,
	EXIT_ERROR,
	EXIT_NOT_FOUND,
	EXIT_RATE_LIMITED,
} from "../../api/client.js";
import type { Tag } from "../../api/types.js";
import { getApiKey } from "../../config.js";

export function requireAuth(): string {
	const apiKey = getApiKey();
	if (!apiKey) {
		console.log(pc.red("Not authenticated. Run `zhe login` first."));
		process.exit(EXIT_AUTH_REQUIRED);
	}
	return apiKey;
}

export function handleApiError(error: unknown): never {
	if (error instanceof ApiClientError) {
		if (error.status === 400) {
			console.log(pc.red(`Error: ${error.message}`));
		} else if (error.status === 404) {
			console.log(pc.red("Idea not found."));
			process.exit(EXIT_NOT_FOUND);
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

export function formatDate(isoDate: string): string {
	const date = new Date(isoDate);
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

export function formatTags(
	tagIds: string[] | null | undefined,
	tagMap?: Map<string, string>,
): string {
	if (!tagIds || tagIds.length === 0) return "";
	return tagIds.map((id) => `[${tagMap?.get(id) ?? id.slice(0, 8)}]`).join(" ");
}

/**
 * Build a tagId→name map by fetching all tags from API.
 * Returns undefined on failure (display degrades to truncated IDs).
 */
export async function buildTagMap(
	client: ApiClient,
	tagIds: string[],
): Promise<Map<string, string> | undefined> {
	if (tagIds.length === 0) return undefined;
	try {
		const { tags } = await client.listTags();
		return new Map(tags.map((t: Tag) => [t.id, t.name]));
	} catch {
		return undefined;
	}
}

export async function confirm(message: string): Promise<boolean> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		rl.question(`${message} [y/N] `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y");
		});
	});
}
