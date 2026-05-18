/**
 * Shared types for ScopedDB. Re-exported from ../scoped.ts to preserve
 * the existing public import path: `@/lib/db/scoped`.
 */

/** Sort field for links. */
export type LinkSortField = 'created' | 'clicks';

/** Sort order. */
export type SortOrder = 'asc' | 'desc';

/** Filter options for getLinks. */
export interface GetLinksOptions {
  /** Keyword search across slug, originalUrl, note, metaTitle, metaDescription */
  query?: string;
  /** Filter by folder ID. Use 'inbox' for links with no folder (folder_id IS NULL) */
  folderId?: string | 'inbox';
  /** Filter by tag ID */
  tagId?: string;
  /** Sort by field (default: created) */
  sortBy?: LinkSortField;
  /** Sort order (default: desc) */
  sortOrder?: SortOrder;
}

/** Filter options for getIdeas. */
export interface GetIdeasOptions {
  /** Keyword search across title and excerpt */
  query?: string;
  /** Filter by tag ID */
  tagId?: string;
}

/** Lightweight shape for list views and search (no full content). */
export interface IdeaListItem {
  id: number;
  title: string | null;
  excerpt: string | null;
  tagIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Full shape for detail view / edit. */
export interface IdeaDetail extends IdeaListItem {
  content: string;
}
