import { describe, expect, it } from "vitest";
import {
	formatDate,
	formatDateTime,
	formatFoldersTable,
	formatLinkDetail,
	formatLinksMinimal,
	formatLinksTable,
	formatTagsTable,
	isValidApiKeyFormat,
	maskApiKey,
	parseLinkId,
	truncate,
} from "../src/utils.js";
import type { Folder, Link, Tag } from "../src/api/types.js";

describe("maskApiKey", () => {
	it("masks API key preserving prefix and suffix", () => {
		expect(maskApiKey("zhe_abcdefghijklmnopqrstuvwxyz")).toBe(
			"zhe_abcd...wxyz",
		);
	});

	it("returns short keys unchanged", () => {
		expect(maskApiKey("zhe_abc")).toBe("zhe_abc");
	});

	it("handles empty string", () => {
		expect(maskApiKey("")).toBe("");
	});
});

describe("isValidApiKeyFormat", () => {
	it("returns true for valid zhe_ prefix", () => {
		expect(isValidApiKeyFormat("zhe_abc123")).toBe(true);
	});

	it("returns false for missing prefix", () => {
		expect(isValidApiKeyFormat("abc123")).toBe(false);
	});

	it("returns false for just prefix", () => {
		expect(isValidApiKeyFormat("zhe_")).toBe(false);
	});

	it("returns false for empty string", () => {
		expect(isValidApiKeyFormat("")).toBe(false);
	});
});

describe("formatDate", () => {
	it("formats ISO date to YYYY-MM-DD", () => {
		expect(formatDate("2026-04-12T10:30:00.000Z")).toBe("2026-04-12");
	});
});

describe("formatDateTime", () => {
	it("formats ISO date to YYYY-MM-DD HH:mm:ss", () => {
		expect(formatDateTime("2026-04-12T10:30:45.000Z")).toBe(
			"2026-04-12 10:30:45",
		);
	});
});

describe("truncate", () => {
	it("returns short strings unchanged", () => {
		expect(truncate("hello", 10)).toBe("hello");
	});

	it("truncates long strings with ellipsis", () => {
		expect(truncate("hello world!", 8)).toBe("hello...");
	});

	it("handles exact length", () => {
		expect(truncate("hello", 5)).toBe("hello");
	});
});

describe("formatLinksTable", () => {
	it("returns 'No links found' for empty array", () => {
		expect(formatLinksTable([])).toBe("No links found.");
	});

	it("formats links as table", () => {
		const links: Link[] = [
			{
				id: 123,
				slug: "my-link",
				originalUrl: "https://example.com/page",
				shortUrl: "https://zhe.to/my-link",
				isCustom: true,
				clicks: 42,
				folderId: null,
				note: null,
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
			},
		];

		const result = formatLinksTable(links);
		expect(result).toContain("ID");
		expect(result).toContain("SLUG");
		expect(result).toContain("123");
		expect(result).toContain("my-link");
	});
});

describe("formatLinksMinimal", () => {
	it("returns empty string for empty array", () => {
		expect(formatLinksMinimal([])).toBe("");
	});

	it("returns short URLs only", () => {
		const links: Link[] = [
			{
				id: 1,
				slug: "abc",
				originalUrl: "https://example.com",
				shortUrl: "https://zhe.to/abc",
				isCustom: false,
				clicks: 0,
				folderId: null,
				note: null,
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
			},
			{
				id: 2,
				slug: "xyz",
				originalUrl: "https://google.com",
				shortUrl: "https://zhe.to/xyz",
				isCustom: false,
				clicks: 0,
				folderId: null,
				note: null,
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
			},
		];

		expect(formatLinksMinimal(links)).toBe("zhe.to/abc\nzhe.to/xyz");
	});
});

describe("formatLinkDetail", () => {
	it("formats link with all fields", () => {
		const link: Link = {
			id: 123,
			slug: "my-link",
			originalUrl: "https://example.com/page",
			shortUrl: "https://zhe.to/my-link",
			isCustom: true,
			clicks: 42,
			folderId: "folder-1",
			note: "Important link",
			expiresAt: "2027-01-01T00:00:00.000Z",
			createdAt: "2026-04-01T10:00:00.000Z",
			updatedAt: "2026-04-01T10:00:00.000Z",
		};

		const result = formatLinkDetail(link);
		expect(result).toContain("Link #123");
		expect(result).toContain("https://zhe.to/my-link");
		expect(result).toContain("my-link (custom)");
		expect(result).toContain("42");
		expect(result).toContain("folder-1");
		expect(result).toContain("Important link");
		expect(result).toContain("2027-01-01");
	});

	it("shows 'Never' for no expiration", () => {
		const link: Link = {
			id: 1,
			slug: "test",
			originalUrl: "https://example.com",
			shortUrl: "https://zhe.to/test",
			isCustom: false,
			clicks: 0,
			folderId: null,
			note: null,
			expiresAt: null,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
		};

		const result = formatLinkDetail(link);
		expect(result).toContain("Never");
	});
});

describe("parseLinkId", () => {
	it("parses valid numeric ID", () => {
		expect(parseLinkId("123")).toBe(123);
	});

	it("returns null for non-numeric", () => {
		expect(parseLinkId("abc")).toBeNull();
	});

	it("returns null for zero", () => {
		expect(parseLinkId("0")).toBeNull();
	});

	it("returns null for negative", () => {
		expect(parseLinkId("-1")).toBeNull();
	});

	it("returns null for float string", () => {
		expect(parseLinkId("12.5")).toBe(12); // parseInt behavior
	});
});

describe("formatFoldersTable", () => {
	it("returns 'No folders found' for empty array", () => {
		expect(formatFoldersTable([])).toBe("No folders found.");
	});

	it("formats folders as table", () => {
		const folders: Folder[] = [
			{
				id: "abc123-def456-ghi789",
				name: "Work",
				icon: "folder",
				createdAt: "2026-04-01T00:00:00.000Z",
			},
		];

		const result = formatFoldersTable(folders);
		expect(result).toContain("ID");
		expect(result).toContain("NAME");
		expect(result).toContain("Work");
		expect(result).toContain("folder");
	});
});

describe("formatTagsTable", () => {
	it("returns 'No tags found' for empty array", () => {
		expect(formatTagsTable([])).toBe("No tags found.");
	});

	it("formats tags as table", () => {
		const tags: Tag[] = [
			{
				id: "tag123-456-789",
				name: "Important",
				color: "#ff0000",
				createdAt: "2026-04-01T00:00:00.000Z",
			},
		];

		const result = formatTagsTable(tags);
		expect(result).toContain("ID");
		expect(result).toContain("NAME");
		expect(result).toContain("Important");
		expect(result).toContain("#ff0000");
	});
});
