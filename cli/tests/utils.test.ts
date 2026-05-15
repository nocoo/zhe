import { describe, expect, it, vi } from "vitest";
import type { Folder, Link, Tag } from "../src/api/types.js";
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
	normalizeHexColor,
	parseLinkId,
	resolveFolderName,
	resolveTagName,
	truncate,
} from "../src/utils.js";

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

	it("truncates long URLs in default mode", () => {
		const links: Link[] = [
			{
				id: 1,
				slug: "very-long-slug-name-here",
				originalUrl:
					"https://example.com/very/long/path/that/should/be/truncated",
				shortUrl: "https://zhe.to/very-long-slug-name-here",
				isCustom: true,
				clicks: 0,
				metaTitle: null,
				metaDescription: null,
				screenshotUrl: null,
				folderId: null,
				note: null,
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
			},
		];

		const result = formatLinksTable(links);
		expect(result).toContain("...");
	});

	it("shows full URLs in wide mode", () => {
		const links: Link[] = [
			{
				id: 1,
				slug: "very-long-slug-name-here",
				originalUrl:
					"https://example.com/very/long/path/that/should/not/be/truncated",
				shortUrl: "https://zhe.to/very-long-slug-name-here",
				isCustom: true,
				clicks: 0,
				metaTitle: null,
				metaDescription: null,
				screenshotUrl: null,
				folderId: null,
				note: null,
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
			},
		];

		const result = formatLinksTable(links, { wide: true });
		expect(result).toContain("very-long-slug-name-here");
		expect(result).toContain(
			"https://example.com/very/long/path/that/should/not/be/truncated",
		);
		expect(result).not.toContain("...");
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
		expect(parseLinkId("12.5")).toBeNull();
	});

	it("returns null for junk-suffixed input", () => {
		expect(parseLinkId("12abc")).toBeNull();
	});

	it("returns null for scientific notation", () => {
		expect(parseLinkId("1e2")).toBeNull();
	});

	it("returns null for hex literal", () => {
		expect(parseLinkId("0x10")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseLinkId("")).toBeNull();
	});

	it("returns null for whitespace", () => {
		expect(parseLinkId("  ")).toBeNull();
	});

	it("returns null for leading-zero input", () => {
		expect(parseLinkId("01")).toBeNull();
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
				linkCount: 12,
				createdAt: "2026-04-01T00:00:00.000Z",
			},
		];

		const result = formatFoldersTable(folders);
		expect(result).toContain("ID");
		expect(result).toContain("NAME");
		expect(result).toContain("LINKS");
		expect(result).toContain("Work");
		expect(result).toContain("12");
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

describe("resolveFolderName", () => {
	const mockClient = {
		listFolders: async () => ({
			folders: [
				{
					id: "abc123-def456-ghi789-jkl012-mno345",
					name: "Work",
					icon: "folder",
					linkCount: 5,
					createdAt: "2026-04-01T00:00:00.000Z",
				},
				{
					id: "xyz987-uvw654-rst321-opq098-lmn765",
					name: "Personal",
					icon: "home",
					linkCount: 3,
					createdAt: "2026-04-02T00:00:00.000Z",
				},
			],
		}),
		listTags: async () => ({ tags: [] }),
	};

	it("returns UUID directly if input looks like UUID", async () => {
		const uuid = "abc123de-f456-7890-abcd-ef1234567890";
		const result = await resolveFolderName(mockClient as never, uuid);
		expect(result).toBe(uuid);
	});

	it("resolves folder name to ID (case-insensitive)", async () => {
		const result = await resolveFolderName(mockClient as never, "work");
		expect(result).toBe("abc123-def456-ghi789-jkl012-mno345");
	});

	it("resolves folder name to ID (exact case)", async () => {
		const result = await resolveFolderName(mockClient as never, "Personal");
		expect(result).toBe("xyz987-uvw654-rst321-opq098-lmn765");
	});

	it("returns null for non-existent folder", async () => {
		const result = await resolveFolderName(mockClient as never, "NonExistent");
		expect(result).toBeNull();
	});

	it("returns null for duplicate folder names", async () => {
		const duplicateClient = {
			listFolders: async () => ({
				folders: [
					{
						id: "id1",
						name: "Same",
						icon: "folder",
						linkCount: 0,
						createdAt: "2026-04-01T00:00:00.000Z",
					},
					{
						id: "id2",
						name: "same",
						icon: "folder",
						linkCount: 0,
						createdAt: "2026-04-02T00:00:00.000Z",
					},
				],
			}),
		};
		const result = await resolveFolderName(duplicateClient as never, "same");
		expect(result).toBeNull();
	});
});

describe("resolveTagName", () => {
	const mockClient = {
		listTags: async () => ({
			tags: [
				{
					id: "tag-abc-123-456-789-012-345",
					name: "Important",
					color: "#ff0000",
					createdAt: "2026-04-01T00:00:00.000Z",
				},
				{
					id: "tag-xyz-987-654-321-098-765",
					name: "Urgent",
					color: "#ff9900",
					createdAt: "2026-04-02T00:00:00.000Z",
				},
			],
		}),
		listFolders: async () => ({ folders: [] }),
	};

	it("returns UUID directly if input looks like UUID", async () => {
		const uuid = "abc123de-f456-7890-abcd-ef1234567890";
		const result = await resolveTagName(mockClient as never, uuid);
		expect(result).toBe(uuid);
	});

	it("resolves tag name to ID (case-insensitive)", async () => {
		const result = await resolveTagName(mockClient as never, "important");
		expect(result).toBe("tag-abc-123-456-789-012-345");
	});

	it("returns null for non-existent tag", async () => {
		const result = await resolveTagName(mockClient as never, "NonExistent");
		expect(result).toBeNull();
	});

	it("returns null for duplicate tag names", async () => {
		const duplicateClient = {
			listTags: async () => ({
				tags: [
					{
						id: "id1",
						name: "Same",
						color: "#ff0000",
						createdAt: "2026-04-01T00:00:00.000Z",
					},
					{
						id: "id2",
						name: "same",
						color: "#ff9900",
						createdAt: "2026-04-02T00:00:00.000Z",
					},
				],
			}),
		};
		const result = await resolveTagName(duplicateClient as never, "same");
		expect(result).toBeNull();
	});

	it("uses custom notFoundMessage when provided", async () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const emptyClient = {
				listTags: async () => ({ tags: [] }),
			};
			await resolveTagName(emptyClient as never, "Missing", {
				notFoundMessage: "Custom not-found",
			});
			const printed = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
			expect(printed).toContain("Custom not-found");
			expect(printed).not.toContain("Create it first");
		} finally {
			consoleSpy.mockRestore();
		}
	});
});

describe("normalizeHexColor", () => {
	it("normalizes 6-digit hex without #", () => {
		expect(normalizeHexColor("3b82f6")).toBe("#3b82f6");
	});

	it("normalizes 6-digit hex with #", () => {
		expect(normalizeHexColor("#3b82f6")).toBe("#3b82f6");
	});

	it("lowercases uppercase hex", () => {
		expect(normalizeHexColor("#3B82F6")).toBe("#3b82f6");
	});

	it("accepts mixed case", () => {
		expect(normalizeHexColor("aB12cD")).toBe("#ab12cd");
	});

	it("returns null for 3-digit shorthand", () => {
		expect(normalizeHexColor("#abc")).toBeNull();
	});

	it("returns null for 8-digit hex", () => {
		expect(normalizeHexColor("#12345678")).toBeNull();
	});

	it("returns null for non-hex characters", () => {
		expect(normalizeHexColor("#zzzzzz")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(normalizeHexColor("")).toBeNull();
	});

	it("returns null for # alone", () => {
		expect(normalizeHexColor("#")).toBeNull();
	});

	it("returns null for trailing whitespace", () => {
		expect(normalizeHexColor("#3b82f6 ")).toBeNull();
	});
});
