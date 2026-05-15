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
	tagIds?: string[];
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface Folder {
	id: string;
	name: string;
	icon: string;
	linkCount: number;
	createdAt: string;
}

/**
 * Folder shape returned by single-folder endpoints (POST/PATCH/GET /folders/:id).
 * The API does not include `linkCount` on these endpoints — only the list endpoint
 * (`GET /folders`) computes it.
 */
export type FolderDetail = Omit<Folder, "linkCount">;

export interface FolderResponse {
	folder: FolderDetail;
}

export interface CreateFolderRequest {
	name: string;
	icon?: string;
}

export interface UpdateFolderRequest {
	name?: string;
	icon?: string;
}

export interface Tag {
	id: string;
	name: string;
	color: string;
	createdAt: string;
}

export interface LinksResponse {
	links: Link[];
	total: number;
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
	sort?: "created" | "clicks";
	order?: "asc" | "desc";
}

// ── Ideas ──

export interface Idea {
	id: number;
	title: string | null;
	content: string;
	excerpt: string | null;
	tagIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface IdeaListItem {
	id: number;
	title: string | null;
	excerpt: string | null;
	tagIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface IdeasResponse {
	ideas: IdeaListItem[];
}

export interface IdeaResponse {
	idea: Idea;
}

export interface CreateIdeaRequest {
	content: string;
	title?: string;
	tagIds?: string[];
}

export interface UpdateIdeaRequest {
	content?: string;
	title?: string | null;
	tagIds?: string[];
}

export interface ListIdeasParams {
	limit?: number;
	offset?: number;
	tagId?: string;
	q?: string;
}
