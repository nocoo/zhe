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
	resolveFolderName,
	resolveTagName,
	resolveTagRef,
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
				metaTitle: null,
				metaDescription: null,
				screenshotUrl: null,
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
				tags: [],
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
				originalUrl: "https://example.com/very/long/path/that/should/be/truncated",
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
				tags: [],
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
				originalUrl: "https://example.com/very/long/path/that/should/not/be/truncated",
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
				tags: [],
			},
		];

		const result = formatLinksTable(links, { wide: true });
		expect(result).toContain("very-long-slug-name-here");
		expect(result).toContain("https://example.com/very/long/path/that/should/not/be/truncated");
		expect(result).not.toContain("...");
	});

	it("omits TAGS column by default", () => {
		const links: Link[] = [
			{
				id: 1,
				slug: "tagged",
				originalUrl: "https://example.com",
				shortUrl: "https://zhe.to/tagged",
				isCustom: false,
				clicks: 0,
				metaTitle: null,
				metaDescription: null,
				screenshotUrl: null,
				folderId: null,
				note: null,
				tagIds: ["tag-1"],
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
			},
		];

		const result = formatLinksTable(links);
		expect(result).not.toContain("TAGS");
	});

	it("renders TAGS column with showTags option", () => {
		const links: Link[] = [
			{
				id: 1,
				slug: "tagged",
				originalUrl: "https://example.com",
				shortUrl: "https://zhe.to/tagged",
				isCustom: false,
				clicks: 0,
				metaTitle: null,
				metaDescription: null,
				screenshotUrl: null,
				folderId: null,
				note: null,
				tagIds: ["tag-abc", "tag-xyz"],
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
			},
		];

		const tagMap = new Map([
			["tag-abc", "work"],
			["tag-xyz", "urgent"],
		]);
		const result = formatLinksTable(links, { showTags: true, tagMap });
		expect(result).toContain("TAGS");
		expect(result).toContain("work");
		// Compact mode truncates the tag column at 12 chars; both names
		// together overflow (4 + 1 + 6 = 11 chars fits, but "work,urgent"
		// is 11 chars which fits without truncation).
		expect(result).toContain("urgent");
	});

	it("falls back to short tag id when tagMap is missing", () => {
		const links: Link[] = [
			{
				id: 1,
				slug: "tagged",
				originalUrl: "https://example.com",
				shortUrl: "https://zhe.to/tagged",
				isCustom: false,
				clicks: 0,
				metaTitle: null,
				metaDescription: null,
				screenshotUrl: null,
				folderId: null,
				note: null,
				tagIds: ["abcdef1234-5678"],
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
			},
		];

		const result = formatLinksTable(links, { showTags: true });
		// Short id prefix (8 chars) used when no name is available.
		expect(result).toContain("abcdef12");
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
				metaTitle: null,
				metaDescription: null,
				screenshotUrl: null,
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
				tags: [],
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
				metaTitle: null,
				metaDescription: null,
				screenshotUrl: null,
				expiresAt: null,
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
				tags: [],
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
			metaTitle: null,
			metaDescription: null,
			screenshotUrl: null,
			expiresAt: "2027-01-01T00:00:00.000Z",
			createdAt: "2026-04-01T10:00:00.000Z",
			updatedAt: "2026-04-01T10:00:00.000Z",
			tags: [],
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
			metaTitle: null,
			metaDescription: null,
			screenshotUrl: null,
			expiresAt: null,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
			tags: [],
		};

		const result = formatLinkDetail(link);
		expect(result).toContain("Never");
	});

	it("renders Tags line with resolved names from tagMap", () => {
		const link: Link = {
			id: 1,
			slug: "test",
			originalUrl: "https://example.com",
			shortUrl: "https://zhe.to/test",
			isCustom: false,
			clicks: 0,
			folderId: null,
			note: null,
			metaTitle: null,
			metaDescription: null,
			screenshotUrl: null,
			tagIds: ["tag-1", "tag-2"],
			expiresAt: null,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
			tags: [],
		};

		const tagMap = new Map([
			["tag-1", "work"],
			["tag-2", "urgent"],
		]);
		const result = formatLinkDetail(link, undefined, tagMap);
		expect(result).toContain("Tags:         work, urgent");
	});

	it("falls back to tag id when tagMap is missing", () => {
		const link: Link = {
			id: 1,
			slug: "test",
			originalUrl: "https://example.com",
			shortUrl: "https://zhe.to/test",
			isCustom: false,
			clicks: 0,
			folderId: null,
			note: null,
			metaTitle: null,
			metaDescription: null,
			screenshotUrl: null,
			tagIds: ["tag-abc"],
			expiresAt: null,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
			tags: [],
		};

		const result = formatLinkDetail(link);
		expect(result).toContain("Tags:         tag-abc");
	});

	it("renders Tags line from embedded tags when tagIds is empty", () => {
		const link: Link = {
			id: 7,
			slug: "tagged",
			originalUrl: "https://example.com/tagged",
			shortUrl: "https://zhe.to/tagged",
			isCustom: false,
			clicks: 0,
			folderId: null,
			note: null,
			metaTitle: null,
			metaDescription: null,
			screenshotUrl: null,
			expiresAt: null,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
			tags: [
				{ id: "t1", name: "work", color: "#ff0000", createdAt: "2026-04-01T00:00:00.000Z" },
				{ id: "t2", name: "urgent", color: "#00ff00", createdAt: "2026-04-01T00:00:00.000Z" },
			],
		};

		const result = formatLinkDetail(link);
		expect(result).toContain("Tags:");
		expect(result).toContain("work, urgent");
	});

	it("omits Tags line when link has no tags", () => {
		const link: Link = {
			id: 8,
			slug: "untagged",
			originalUrl: "https://example.com/untagged",
			shortUrl: "https://zhe.to/untagged",
			isCustom: false,
			clicks: 0,
			folderId: null,
			note: null,
			metaTitle: null,
			metaDescription: null,
			screenshotUrl: null,
			tagIds: [],
			expiresAt: null,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
			tags: [],
		};

		const result = formatLinkDetail(link);
		expect(result).not.toContain("Tags:");
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
});

describe("resolveTagRef", () => {
	const mockClient = {
		listTags: async () => ({
			tags: [
				{
					id: "11111111-1111-1111-1111-111111111111",
					name: "Important",
					color: "#ff0000",
					createdAt: "2026-04-01T00:00:00.000Z",
				},
				{
					id: "22222222-2222-2222-2222-222222222222",
					name: "Urgent",
					color: "#ff9900",
					createdAt: "2026-04-02T00:00:00.000Z",
				},
			],
		}),
		listFolders: async () => ({ folders: [] }),
	};

	it("resolves UUID input to canonical id + name", async () => {
		const result = await resolveTagRef(
			mockClient as never,
			"11111111-1111-1111-1111-111111111111",
		);
		expect(result).toEqual({
			kind: "found",
			id: "11111111-1111-1111-1111-111111111111",
			name: "Important",
		});
	});

	it("returns not_found when UUID does not match any tag", async () => {
		const result = await resolveTagRef(
			mockClient as never,
			"99999999-9999-9999-9999-999999999999",
		);
		expect(result).toEqual({ kind: "not_found" });
	});

	it("resolves tag name to id + name (case-insensitive)", async () => {
		const result = await resolveTagRef(mockClient as never, "important");
		expect(result).toEqual({
			kind: "found",
			id: "11111111-1111-1111-1111-111111111111",
			name: "Important",
		});
	});

	it("returns not_found when name does not exist", async () => {
		const result = await resolveTagRef(mockClient as never, "missing");
		expect(result).toEqual({ kind: "not_found" });
	});

	it("returns ambiguous when multiple tags share the name", async () => {
		const duplicateClient = {
			listTags: async () => ({
				tags: [
					{
						id: "11111111-1111-1111-1111-111111111111",
						name: "Same",
						color: "#ff0000",
						createdAt: "2026-04-01T00:00:00.000Z",
					},
					{
						id: "22222222-2222-2222-2222-222222222222",
						name: "same",
						color: "#ff9900",
						createdAt: "2026-04-02T00:00:00.000Z",
					},
				],
			}),
		};
		const result = await resolveTagRef(duplicateClient as never, "same");
		expect(result).toEqual({ kind: "ambiguous" });
	});
});
