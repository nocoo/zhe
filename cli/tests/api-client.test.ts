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
});
