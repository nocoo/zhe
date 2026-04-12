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
	metaTitle: string | null;
	metaDescription: string | null;
	screenshotUrl: string | null;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface Folder {
	id: string;
	name: string;
	icon: string;
	createdAt: string;
}

export interface Tag {
	id: string;
	name: string;
	color: string;
	createdAt: string;
}

export interface LinksResponse {
	links: Link[];
}

export interface LinkResponse {
	link: Link;
}

export interface FoldersResponse {
	folders: Folder[];
}

export interface TagsResponse {
	tags: Tag[];
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
	metaTitle?: string | null;
	metaDescription?: string | null;
	screenshotUrl?: string | null;
	addTags?: string[];
	removeTags?: string[];
}

export interface ApiError {
	error: string;
}

export interface ListLinksParams {
	limit?: number;
	offset?: number;
	folderId?: string;
	query?: string;
	inbox?: boolean;
	tagId?: string;
}
