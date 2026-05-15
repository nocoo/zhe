import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiClientError } from "../src/api/client.js";
import { CLI_VERSION } from "../src/version.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ApiClient", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("sets default version in user agent", () => {
			const client = new ApiClient("zhe_testkey");
			// Access internal state via a request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ links: [] }),
			});
			client.listLinks();
			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const headers = options.headers as Record<string, string>;
			expect(headers["User-Agent"]).toBe(`zhe-cli/${CLI_VERSION}`);
		});

		it("allows custom version", () => {
			const client = new ApiClient("zhe_testkey", "2.0.0");
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ links: [] }),
			});
			client.listLinks();
			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const headers = options.headers as Record<string, string>;
			expect(headers["User-Agent"]).toBe("zhe-cli/2.0.0");
		});
	});

	describe("listLinks", () => {
		it("returns links from API", async () => {
			const links = [
				{ id: 1, slug: "test", originalUrl: "https://example.com" },
			];
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ links }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.listLinks();

			expect(result.links).toEqual(links);
			expect(mockFetch).toHaveBeenCalledOnce();
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/links");
			expect(options.headers).toHaveProperty(
				"Authorization",
				"Bearer zhe_testkey",
			);
		});

		it("appends query params for limit, offset, folderId", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ links: [] }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.listLinks({ limit: 10, offset: 5, folderId: "folder-123" });

			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toContain("limit=10");
			expect(url).toContain("offset=5");
			expect(url).toContain("folderId=folder-123");
		});

		it("appends query param for keyword search", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ links: [] }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.listLinks({ query: "github" });

			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toContain("q=github");
		});

		it("sets folderId=null for inbox filter", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ links: [] }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.listLinks({ inbox: true });

			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toContain("folderId=null");
		});

		it("appends tagId param for tag filter", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ links: [] }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.listLinks({ tagId: "tag-123" });

			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toContain("tagId=tag-123");
		});
	});

	describe("getLink", () => {
		it("returns link details by ID", async () => {
			const link = { id: 123, slug: "my-link" };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ link }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.getLink(123);

			expect(result.link).toEqual(link);
			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toBe("https://zhe.to/api/v1/links/123");
		});

		it("throws ApiClientError on 404", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				headers: new Headers(),
				json: async () => ({ error: "Not found" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(client.getLink(999)).rejects.toThrow(ApiClientError);
		});
	});

	describe("createLink", () => {
		it("creates a link and returns response", async () => {
			const link = { id: 1, slug: "new-link", shortUrl: "https://zhe.to/new-link" };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: new Headers(),
				json: async () => ({ link }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.createLink({ url: "https://example.com" });

			expect(result.link).toEqual(link);
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/links");
			expect(options.method).toBe("POST");
			expect(JSON.parse(options.body as string)).toEqual({
				url: "https://example.com",
			});
		});

		it("sends optional fields when provided", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: new Headers(),
				json: async () => ({ link: {} }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.createLink({
				url: "https://example.com",
				slug: "custom",
				folderId: "folder-1",
				note: "My note",
				expiresAt: "2027-01-01",
			});

			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string);
			expect(body.slug).toBe("custom");
			expect(body.folderId).toBe("folder-1");
			expect(body.note).toBe("My note");
			expect(body.expiresAt).toBe("2027-01-01");
		});

		it("throws ApiClientError on 409 conflict", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 409,
				headers: new Headers(),
				json: async () => ({ error: "Slug already in use" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(
				client.createLink({ url: "https://example.com", slug: "taken" }),
			).rejects.toThrow(ApiClientError);
		});
	});

	describe("updateLink", () => {
		it("updates a link", async () => {
			const link = { id: 123, slug: "updated" };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ link }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.updateLink(123, { slug: "updated" });

			expect(result.link).toEqual(link);
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/links/123");
			expect(options.method).toBe("PATCH");
		});

		it("sends metadata fields when provided", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ link: {} }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.updateLink(123, {
				metaTitle: "My Title",
				metaDescription: "My Description",
				screenshotUrl: "https://example.com/ss.png",
			});

			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string);
			expect(body.metaTitle).toBe("My Title");
			expect(body.metaDescription).toBe("My Description");
			expect(body.screenshotUrl).toBe("https://example.com/ss.png");
		});

		it("sends tag operations when provided", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ link: {} }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.updateLink(123, {
				addTags: ["tag-1"],
				removeTags: ["tag-2"],
			});

			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string);
			expect(body.addTags).toEqual(["tag-1"]);
			expect(body.removeTags).toEqual(["tag-2"]);
		});
	});

	describe("deleteLink", () => {
		it("deletes a link", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 204,
				headers: new Headers(),
				json: async () => ({}),
			});

			const client = new ApiClient("zhe_testkey");
			await client.deleteLink(123);

			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/links/123");
			expect(options.method).toBe("DELETE");
		});
	});

	describe("listFolders", () => {
		it("returns folders from API", async () => {
			const folders = [
				{ id: "folder-1", name: "Work", icon: "briefcase", createdAt: "2026-01-01" },
			];
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ folders }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.listFolders();

			expect(result.folders).toEqual(folders);
			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toBe("https://zhe.to/api/v1/folders");
		});
	});

	describe("createFolder", () => {
		it("POSTs name + icon and returns folder", async () => {
			const folder = {
				id: "folder-new",
				name: "Reading",
				icon: "📚",
				createdAt: "2026-01-02",
			};
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: new Headers(),
				json: async () => ({ folder }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.createFolder({ name: "Reading", icon: "📚" });

			expect(result.folder).toEqual(folder);
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/folders");
			expect(options.method).toBe("POST");
			const body = JSON.parse(options.body as string);
			expect(body).toEqual({ name: "Reading", icon: "📚" });
		});

		it("POSTs without icon when omitted", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: new Headers(),
				json: async () => ({
					folder: {
						id: "folder-2",
						name: "Plain",
						icon: "folder",
						createdAt: "2026-01-02",
					},
				}),
			});

			const client = new ApiClient("zhe_testkey");
			await client.createFolder({ name: "Plain" });

			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string);
			expect(body).toEqual({ name: "Plain" });
		});

		it("throws on 400 error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				headers: new Headers(),
				json: async () => ({ error: "name cannot be empty" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(client.createFolder({ name: "" })).rejects.toThrow(
				ApiClientError,
			);
		});
	});

	describe("updateFolder", () => {
		it("PATCHes folder by id with partial body", async () => {
			const folder = {
				id: "folder-1",
				name: "Work Renamed",
				icon: "💼",
				createdAt: "2026-01-01",
			};
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ folder }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.updateFolder("folder-1", {
				name: "Work Renamed",
				icon: "💼",
			});

			expect(result.folder).toEqual(folder);
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/folders/folder-1");
			expect(options.method).toBe("PATCH");
			const body = JSON.parse(options.body as string);
			expect(body).toEqual({ name: "Work Renamed", icon: "💼" });
		});

		it("supports name-only update", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({
					folder: {
						id: "folder-1",
						name: "Renamed",
						icon: "folder",
						createdAt: "2026-01-01",
					},
				}),
			});

			const client = new ApiClient("zhe_testkey");
			await client.updateFolder("folder-1", { name: "Renamed" });

			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string);
			expect(body).toEqual({ name: "Renamed" });
		});

		it("throws ApiClientError on 404", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				headers: new Headers(),
				json: async () => ({ error: "Folder not found" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(
				client.updateFolder("missing", { name: "x" }),
			).rejects.toThrow(ApiClientError);
		});
	});

	describe("deleteFolder", () => {
		it("DELETEs folder by id", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ success: true }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.deleteFolder("folder-1");

			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/folders/folder-1");
			expect(options.method).toBe("DELETE");
		});

		it("throws ApiClientError on 404", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				headers: new Headers(),
				json: async () => ({ error: "Folder not found" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(client.deleteFolder("missing")).rejects.toThrow(
				ApiClientError,
			);
		});
	});

	describe("listTags", () => {
		it("returns tags from API", async () => {
			const tags = [
				{ id: "tag-1", name: "Important", color: "#ff0000", createdAt: "2026-01-01" },
			];
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ tags }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.listTags();

			expect(result.tags).toEqual(tags);
			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toBe("https://zhe.to/api/v1/tags");
		});
	});

	describe("createTag", () => {
		it("POSTs name + color and returns tag", async () => {
			const tag = {
				id: "tag-new",
				name: "Reading",
				color: "#3b82f6",
				createdAt: "2026-01-02",
			};
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: new Headers(),
				json: async () => ({ tag }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.createTag({
				name: "Reading",
				color: "#3b82f6",
			});

			expect(result.tag).toEqual(tag);
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/tags");
			expect(options.method).toBe("POST");
			const body = JSON.parse(options.body as string);
			expect(body).toEqual({ name: "Reading", color: "#3b82f6" });
		});

		it("throws on 400 error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				headers: new Headers(),
				json: async () => ({ error: "name cannot be empty" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(
				client.createTag({ name: "", color: "#ffffff" }),
			).rejects.toThrow(ApiClientError);
		});
	});

	describe("updateTag", () => {
		it("PATCHes tag by id with partial body", async () => {
			const tag = {
				id: "tag-1",
				name: "Renamed",
				color: "#00ff00",
				createdAt: "2026-01-01",
			};
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ tag }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.updateTag("tag-1", {
				name: "Renamed",
				color: "#00ff00",
			});

			expect(result.tag).toEqual(tag);
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/tags/tag-1");
			expect(options.method).toBe("PATCH");
			const body = JSON.parse(options.body as string);
			expect(body).toEqual({ name: "Renamed", color: "#00ff00" });
		});

		it("supports color-only update", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({
					tag: {
						id: "tag-1",
						name: "Important",
						color: "#aa00aa",
						createdAt: "2026-01-01",
					},
				}),
			});

			const client = new ApiClient("zhe_testkey");
			await client.updateTag("tag-1", { color: "#aa00aa" });

			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string);
			expect(body).toEqual({ color: "#aa00aa" });
		});

		it("throws ApiClientError on 404", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				headers: new Headers(),
				json: async () => ({ error: "Tag not found" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(
				client.updateTag("missing", { name: "x" }),
			).rejects.toThrow(ApiClientError);
		});
	});

	describe("deleteTag", () => {
		it("DELETEs tag by id", async () => {
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

		it("throws ApiClientError on 404", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				headers: new Headers(),
				json: async () => ({ error: "Tag not found" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(client.deleteTag("missing")).rejects.toThrow(
				ApiClientError,
			);
		});
	});

	describe("verifyKey", () => {
		it("returns true for valid key", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ links: [] }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.verifyKey();

			expect(result).toBe(true);
		});

		it("returns false for 401", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				headers: new Headers(),
				json: async () => ({ error: "Unauthorized" }),
			});

			const client = new ApiClient("zhe_badkey");
			const result = await client.verifyKey();

			expect(result).toBe(false);
		});

		it("returns false for 403", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				headers: new Headers(),
				json: async () => ({ error: "Forbidden" }),
			});

			const client = new ApiClient("zhe_limited");
			const result = await client.verifyKey();

			expect(result).toBe(false);
		});

		it("throws for other errors", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				headers: new Headers(),
				json: async () => ({ error: "Server error" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(client.verifyKey()).rejects.toThrow(ApiClientError);
		});
	});

	describe("error handling", () => {
		it("throws ApiClientError with status for HTTP errors", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				headers: new Headers(),
				json: async () => ({ error: "Internal error" }),
			});

			const client = new ApiClient("zhe_testkey");
			try {
				await client.listLinks();
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ApiClientError);
				const err = e as ApiClientError;
				expect(err.status).toBe(500);
				expect(err.message).toBe("Internal error");
			}
		});

		it("uses default error message when API returns no error field", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 429,
				headers: new Headers(),
				json: async () => ({}),
			});

			const client = new ApiClient("zhe_testkey");
			try {
				await client.listLinks();
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ApiClientError);
				const err = e as ApiClientError;
				expect(err.message).toBe("Rate limit exceeded. Try again later.");
			}
		});

		it("logs warning when rate limit is low", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ "X-RateLimit-Remaining": "5" }),
				json: async () => ({ links: [] }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.listLinks();

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Rate limit low"),
			);
			warnSpy.mockRestore();
		});

		it("handles network timeout", async () => {
			const abortError = new Error("aborted");
			abortError.name = "AbortError";
			mockFetch.mockRejectedValueOnce(abortError);

			const client = new ApiClient("zhe_testkey");
			await expect(client.listLinks()).rejects.toThrow("Request timed out");
		});

		it("handles DNS failure", async () => {
			const dnsError = new Error("getaddrinfo ENOTFOUND zhe.to");
			mockFetch.mockRejectedValueOnce(dnsError);

			const client = new ApiClient("zhe_testkey");
			await expect(client.listLinks()).rejects.toThrow("Could not reach zhe.to");
		});

		it("handles generic network error", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Network failed"));

			const client = new ApiClient("zhe_testkey");
			await expect(client.listLinks()).rejects.toThrow("Network error");
		});

		it("re-throws ApiClientError as-is", async () => {
			const apiError = new ApiClientError(400, "Bad request");
			mockFetch.mockRejectedValueOnce(apiError);

			const client = new ApiClient("zhe_testkey");
			try {
				await client.listLinks();
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBe(apiError);
			}
		});

		it("handles response JSON parse error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				headers: new Headers(),
				json: async () => {
					throw new Error("Invalid JSON");
				},
			});

			const client = new ApiClient("zhe_testkey");
			try {
				await client.listLinks();
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ApiClientError);
				const err = e as ApiClientError;
				expect(err.status).toBe(400);
				expect(err.message).toBe("Invalid request"); // Falls back to default
			}
		});

		it("uses default message for unknown status codes", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 418, // I'm a teapot
				headers: new Headers(),
				json: async () => ({}),
			});

			const client = new ApiClient("zhe_testkey");
			try {
				await client.listLinks();
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ApiClientError);
				const err = e as ApiClientError;
				expect(err.message).toBe("HTTP error 418");
			}
		});
	});

	// ── Ideas ──

	describe("listIdeas", () => {
		it("returns ideas from API", async () => {
			const ideas = [
				{ id: 1, title: "Test Idea", excerpt: "Some text", tags: [], createdAt: "2026-01-15", updatedAt: "2026-01-15" },
			];
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ ideas }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.listIdeas();

			expect(result.ideas).toEqual(ideas);
			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toBe("https://zhe.to/api/v1/ideas");
		});

		it("appends query params for limit, offset, tagId", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ ideas: [] }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.listIdeas({ limit: 10, offset: 5, tagId: "tag-123" });

			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toContain("limit=10");
			expect(url).toContain("offset=5");
			expect(url).toContain("tagId=tag-123");
		});

		it("appends query param for keyword search", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ ideas: [] }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.listIdeas({ q: "react" });

			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toContain("q=react");
		});
	});

	describe("getIdea", () => {
		it("returns idea details by ID", async () => {
			const idea = { id: 42, title: "My Idea", content: "Full content", tags: [] };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ idea }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.getIdea(42);

			expect(result.idea).toEqual(idea);
			const [url] = mockFetch.mock.calls[0] as [string];
			expect(url).toBe("https://zhe.to/api/v1/ideas/42");
		});

		it("throws ApiClientError on 404", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				headers: new Headers(),
				json: async () => ({ error: "Not found" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(client.getIdea(999)).rejects.toThrow(ApiClientError);
		});
	});

	describe("createIdea", () => {
		it("creates an idea and returns response", async () => {
			const idea = { id: 1, title: null, content: "My thought", tags: [] };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: new Headers(),
				json: async () => ({ idea }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.createIdea({ content: "My thought" });

			expect(result.idea).toEqual(idea);
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/ideas");
			expect(options.method).toBe("POST");
			expect(JSON.parse(options.body as string)).toEqual({
				content: "My thought",
			});
		});

		it("sends optional fields when provided", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: new Headers(),
				json: async () => ({ idea: {} }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.createIdea({
				content: "Body text",
				title: "My Title",
				tagIds: ["tag-1", "tag-2"],
			});

			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string);
			expect(body.content).toBe("Body text");
			expect(body.title).toBe("My Title");
			expect(body.tagIds).toEqual(["tag-1", "tag-2"]);
		});

		it("throws ApiClientError on 400 validation error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				headers: new Headers(),
				json: async () => ({ error: "Invalid tag IDs" }),
			});

			const client = new ApiClient("zhe_testkey");
			await expect(
				client.createIdea({ content: "Test", tagIds: ["invalid"] }),
			).rejects.toThrow(ApiClientError);
		});
	});

	describe("updateIdea", () => {
		it("updates an idea", async () => {
			const idea = { id: 42, title: "Updated", content: "New content", tags: [] };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ idea }),
			});

			const client = new ApiClient("zhe_testkey");
			const result = await client.updateIdea(42, { title: "Updated" });

			expect(result.idea).toEqual(idea);
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/ideas/42");
			expect(options.method).toBe("PATCH");
		});

		it("sends content, title, and tagIds when provided", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => ({ idea: {} }),
			});

			const client = new ApiClient("zhe_testkey");
			await client.updateIdea(42, {
				content: "New content",
				title: null,
				tagIds: ["tag-1"],
			});

			const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string);
			expect(body.content).toBe("New content");
			expect(body.title).toBeNull();
			expect(body.tagIds).toEqual(["tag-1"]);
		});
	});

	describe("deleteIdea", () => {
		it("deletes an idea", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 204,
				headers: new Headers(),
				json: async () => ({}),
			});

			const client = new ApiClient("zhe_testkey");
			await client.deleteIdea(42);

			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://zhe.to/api/v1/ideas/42");
			expect(options.method).toBe("DELETE");
		});
	});
});
