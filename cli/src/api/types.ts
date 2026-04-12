/**
 * API types for zhe.to v1 API
 */

export interface Link {
	id: number;
	slug: string;
	originalUrl: string;
	shortUrl: string;
	isCustom: boolean;
	clicks: number;
	folderId: string | null;
	note: string | null;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface LinksResponse {
	links: Link[];
}

export interface LinkResponse {
	link: Link;
}

export interface CreateLinkRequest {
	url: string;
	slug?: string;
	folderId?: string;
	note?: string;
	expiresAt?: string;
}

export interface UpdateLinkRequest {
	originalUrl?: string;
	slug?: string;
	folderId?: string | null;
	note?: string | null;
	expiresAt?: string | null;
}

export interface ApiError {
	error: string;
}

export interface ListLinksParams {
	limit?: number;
	offset?: number;
	folderId?: string;
}
