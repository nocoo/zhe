/**
 * HTTP client for zhe.to API v1
 */

import { CLI_VERSION } from "../version.js";
import type {
	ApiError,
	CreateLinkRequest,
	FoldersResponse,
	LinkResponse,
	LinksResponse,
	ListLinksParams,
	TagsResponse,
	UpdateLinkRequest,
} from "./types.js";

const API_BASE = "https://zhe.to/api/v1";
const TIMEOUT_MS = 30_000;

export class ApiClient {
	private apiKey: string;
	private userAgent: string;

	constructor(apiKey: string, version = CLI_VERSION) {
		this.apiKey = apiKey;
		this.userAgent = `zhe-cli/${version}`;
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
	): Promise<T> {
		const url = `${API_BASE}${path}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				method,
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
					"User-Agent": this.userAgent,
				},
				...(body ? { body: JSON.stringify(body) } : {}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			// Handle rate limit warning
			const remaining = response.headers.get("X-RateLimit-Remaining");
			if (remaining && Number.parseInt(remaining, 10) < 10) {
				console.warn(
					`Warning: Rate limit low (${remaining} requests remaining)`,
				);
			}

			if (!response.ok) {
				const errorBody = (await response.json().catch(() => ({}))) as ApiError;
				throw new ApiClientError(
					response.status,
					errorBody.error || getDefaultErrorMessage(response.status),
				);
			}

			// Handle 204 No Content
			if (response.status === 204) {
				return {} as T;
			}

			return (await response.json()) as T;
		} catch (error) {
			clearTimeout(timeoutId);

			if (error instanceof ApiClientError) {
				throw error;
			}

			if (error instanceof Error) {
				if (error.name === "AbortError") {
					throw new ApiClientError(
						0,
						"Request timed out. Check your connection and try again.",
					);
				}
				if (
					error.message.includes("ENOTFOUND") ||
					error.message.includes("getaddrinfo")
				) {
					throw new ApiClientError(
						0,
						"Could not reach zhe.to. Check your connection.",
					);
				}
			}

			throw new ApiClientError(0, "Network error. Please try again.");
		}
	}

	/**
	 * List links with optional filters
	 */
	async listLinks(params: ListLinksParams = {}): Promise<LinksResponse> {
		const searchParams = new URLSearchParams();
		if (params.limit) searchParams.set("limit", String(params.limit));
		if (params.offset) searchParams.set("offset", String(params.offset));
		if (params.query) searchParams.set("q", params.query);
		if (params.inbox) {
			searchParams.set("folderId", "null");
		} else if (params.folderId) {
			searchParams.set("folderId", params.folderId);
		}
		if (params.tagId) searchParams.set("tagId", params.tagId);

		const query = searchParams.toString();
		const path = query ? `/links?${query}` : "/links";
		return this.request<LinksResponse>("GET", path);
	}

	/**
	 * Get a single link by ID
	 */
	async getLink(id: number): Promise<LinkResponse> {
		return this.request<LinkResponse>("GET", `/links/${id}`);
	}

	/**
	 * Create a new link
	 */
	async createLink(data: CreateLinkRequest): Promise<LinkResponse> {
		return this.request<LinkResponse>("POST", "/links", data);
	}

	/**
	 * Update an existing link
	 */
	async updateLink(id: number, data: UpdateLinkRequest): Promise<LinkResponse> {
		return this.request<LinkResponse>("PATCH", `/links/${id}`, data);
	}

	/**
	 * Delete a link
	 */
	async deleteLink(id: number): Promise<void> {
		await this.request<Record<string, never>>("DELETE", `/links/${id}`);
	}

	/**
	 * List all folders
	 */
	async listFolders(): Promise<FoldersResponse> {
		return this.request<FoldersResponse>("GET", "/folders");
	}

	/**
	 * List all tags
	 */
	async listTags(): Promise<TagsResponse> {
		return this.request<TagsResponse>("GET", "/tags");
	}

	/**
	 * Verify API key by making a test request
	 */
	async verifyKey(): Promise<boolean> {
		try {
			await this.listLinks({ limit: 1 });
			return true;
		} catch (error) {
			if (error instanceof ApiClientError) {
				if (error.status === 401 || error.status === 403) {
					return false;
				}
			}
			throw error;
		}
	}
}

export class ApiClientError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "ApiClientError";
	}
}

function getDefaultErrorMessage(status: number): string {
	const messages: Record<number, string> = {
		400: "Invalid request",
		401: "Not authenticated. Run `zhe login`.",
		403: "Permission denied. Check your API Key scopes.",
		404: "Not found",
		409: "Conflict",
		429: "Rate limit exceeded. Try again later.",
		500: "Server error",
	};
	return messages[status] || `HTTP error ${status}`;
}

// Exit codes
export const EXIT_SUCCESS = 0;
export const EXIT_ERROR = 1;
export const EXIT_INVALID_ARGS = 2;
export const EXIT_AUTH_REQUIRED = 3;
export const EXIT_NOT_FOUND = 4;
export const EXIT_RATE_LIMITED = 5;
