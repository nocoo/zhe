/** Shared helpers for the `zhe todo` subcommands. */

import * as readline from "node:readline";
import { pc } from "@nocoo/base-cli";
import {
  ApiClientError,
  EXIT_AUTH_REQUIRED,
  EXIT_ERROR,
  EXIT_NOT_FOUND,
  EXIT_RATE_LIMITED,
} from "../../api/client.js";
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
      console.log(pc.red("Todo not found."));
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

export function formatTagNames(tagNames: string[] | null | undefined): string {
  if (!tagNames || tagNames.length === 0) return "";
  return tagNames.map((name) => `[${name}]`).join(" ");
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
