/**
 * Tests for the `zhe tag` command, focused on the parts that don't roundtrip
 * through the API: hex-color validation, name vs UUID resolution, the delete
 * confirmation prompt (with readline mocked), and the create/update happy
 * paths against a mocked fetch.
 */

import * as readline from "node:readline";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/api/client.js";
import { normalizeHexColor, resolveTagName } from "../src/utils.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Hoisted state shared with the mocked readline module so each test can drive
// the prompt with a different fixed answer.
const readlineState = vi.hoisted(() => ({
	answer: "",
	lastPrompt: "" as string,
	closed: false,
	createCalls: 0,
}));

vi.mock("node:readline", () => ({
	createInterface: () => {
		readlineState.createCalls++;
		readlineState.closed = false;
		return {
			question: (prompt: string, cb: (answer: string) => void) => {
				readlineState.lastPrompt = prompt;
				cb(readlineState.answer);
			},
			close: () => {
				readlineState.closed = true;
			},
		};
	},
}));

beforeEach(() => {
	mockFetch.mockReset();
	readlineState.answer = "";
	readlineState.lastPrompt = "";
	readlineState.closed = false;
	readlineState.createCalls = 0;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("tag color validation (normalizeHexColor)", () => {
	it("accepts both `3b82f6` and `#3b82f6`", () => {
		expect(normalizeHexColor("3b82f6")).toBe("#3b82f6");
		expect(normalizeHexColor("#3b82f6")).toBe("#3b82f6");
	});

	it("rejects clearly invalid colors", () => {
		expect(normalizeHexColor("blue")).toBeNull();
		expect(normalizeHexColor("#abc")).toBeNull();
		expect(normalizeHexColor("#3b82f")).toBeNull();
		expect(normalizeHexColor("ggggggg")).toBeNull();
	});
});

describe("tag ref resolution (resolveTagName)", () => {
	const tags = [
		{
			id: "11111111-2222-3333-4444-555555555555",
			name: "Important",
			color: "#ff0000",
			createdAt: "2026-01-01T00:00:00Z",
		},
		{
			id: "66666666-7777-8888-9999-aaaaaaaaaaaa",
			name: "Urgent",
			color: "#ff9900",
			createdAt: "2026-01-02T00:00:00Z",
		},
	];

	it("returns the input directly when it already looks like a UUID", async () => {
		const client = {
			listTags: vi.fn(),
		} as unknown as ApiClient;

		const uuid = "abcdef01-2345-6789-abcd-ef0123456789";
		const result = await resolveTagName(client, uuid);

		expect(result).toBe(uuid);
		expect(client.listTags).not.toHaveBeenCalled();
	});

	it("resolves a name (case-insensitive) to its tag id", async () => {
		const client = {
			listTags: vi.fn(async () => ({ tags })),
		} as unknown as ApiClient;

		const result = await resolveTagName(client, "important");
		expect(result).toBe("11111111-2222-3333-4444-555555555555");
	});

	it("returns null with the custom not-found message when no match", async () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const client = {
			listTags: vi.fn(async () => ({ tags })),
		} as unknown as ApiClient;

		const result = await resolveTagName(client, "missing", {
			notFoundMessage: "Tag not found: missing",
		});

		expect(result).toBeNull();
		const printed = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(printed).toContain("Tag not found: missing");
		expect(printed).not.toContain("Create it first");
	});
});

describe("tag api roundtrips (mocked fetch)", () => {
	it("createTag POSTs name and color", async () => {
		const tag = {
			id: "tag-1",
			name: "Important",
			color: "#3b82f6",
			createdAt: "2026-01-01T00:00:00Z",
		};
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 201,
			headers: new Headers(),
			json: async () => ({ tag }),
		});

		const client = new ApiClient("zhe_testkey");
		const result = await client.createTag({
			name: "Important",
			color: "#3b82f6",
		});

		expect(result.tag).toEqual(tag);
		const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://zhe.to/api/v1/tags");
		expect(options.method).toBe("POST");
		expect(JSON.parse(options.body as string)).toEqual({
			name: "Important",
			color: "#3b82f6",
		});
	});

	it("updateTag PATCHes only the provided fields", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			headers: new Headers(),
			json: async () => ({
				tag: {
					id: "tag-1",
					name: "Renamed",
					color: "#3b82f6",
					createdAt: "2026-01-01T00:00:00Z",
				},
			}),
		});

		const client = new ApiClient("zhe_testkey");
		await client.updateTag("tag-1", { name: "Renamed" });

		const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://zhe.to/api/v1/tags/tag-1");
		expect(options.method).toBe("PATCH");
		expect(JSON.parse(options.body as string)).toEqual({ name: "Renamed" });
	});

	it("deleteTag DELETEs by id", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			headers: new Headers(),
			json: async () => ({ success: true }),
		});

		const client = new ApiClient("zhe_testkey");
		await client.deleteTag("tag-1");

		const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://zhe.to/api/v1/tags/tag-1");
		expect(options.method).toBe("DELETE");
	});
});

describe("tag delete confirmation (mocked readline)", () => {
	// promptYn mirrors the delete subcommand's confirm() helper exactly. We
	// stub node:readline at the module level (see vi.mock above) so each test
	// can drive the prompt with a fixed answer.
	async function promptYn(message: string): Promise<boolean> {
		return new Promise((resolve) => {
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});
			rl.question(`${message} (y/N) `, (answer) => {
				rl.close();
				resolve(answer.trim().toLowerCase() === "y");
			});
		});
	}

	it("returns true on 'y'", async () => {
		readlineState.answer = "y";
		await expect(promptYn('Delete tag "foo"?')).resolves.toBe(true);
		expect(readlineState.closed).toBe(true);
	});

	it("returns true on 'Y' (case-insensitive)", async () => {
		readlineState.answer = "Y";
		await expect(promptYn('Delete tag "foo"?')).resolves.toBe(true);
	});

	it("returns false on empty answer (default No)", async () => {
		readlineState.answer = "";
		await expect(promptYn('Delete tag "foo"?')).resolves.toBe(false);
	});

	it("returns false on 'n'", async () => {
		readlineState.answer = "n";
		await expect(promptYn('Delete tag "foo"?')).resolves.toBe(false);
	});

	it("trims whitespace before checking", async () => {
		readlineState.answer = "  y  ";
		await expect(promptYn('Delete tag "foo"?')).resolves.toBe(true);
	});

	it("uses the message we passed in the prompt", async () => {
		readlineState.answer = "n";
		await promptYn('Delete tag "needs-quoting"?');
		expect(readlineState.lastPrompt).toBe('Delete tag "needs-quoting"? (y/N) ');
	});
});
