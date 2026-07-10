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

// ================================================================
// Todos (docs/21-todos-feature.md)
// ================================================================

/**
 * Server-enforced maximum tree depth. UI shows an early warning at 10+, but
 * the write-time guard in moveTodo/createTodo is the authoritative check.
 */
export const MAX_TODO_DEPTH = 12;

/**
 * Lightweight shape for tree rendering. No content, no doneAt — those cost
 * bytes on every visible row and the tree can be thousands of nodes.
 */
export interface TodoTreeNode {
  id: number;
  parentId: number | null;
  position: number;
  title: string;
  done: boolean;
  hasContent: boolean;
  tagNames: string[];
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Detail shape for the right-pane content view. */
export interface TodoDetail extends TodoTreeNode {
  content: string | null;
  excerpt: string | null;
  doneAt: Date | null;
}

/** Payload for createTodo. */
export interface CreateTodoInput {
  title: string;
  parentId?: number | null;
  content?: string | null;
  dueAt?: Date | null;
  tagNames?: string[];
}

/** Payload for updateTodo. All fields optional; only present keys are written. */
export interface UpdateTodoPatch {
  title?: string;
  content?: string | null;
  done?: boolean;
  dueAt?: Date | null;
  tagNames?: string[];
}

/** Move target — parent + position among that parent's siblings. */
export interface MoveTodoInput {
  parentId: number | null;
  position: number;
}

/**
 * Affected slice returned by moveTodo so the client can rebuild its tree
 * without a full refetch. Sibling arrays are the post-move dense id order.
 */
export interface MoveTodoResult {
  movedId: number;
  oldParentId: number | null;
  newParentId: number | null;
  oldParentSiblings: number[];
  newParentSiblings: number[];
}

/**
 * Thrown by moveTodo when the write-time guard rejects the move (cycle,
 * depth cap, ownership, or a race between preflight and commit). The
 * server-action layer maps this to `ActionResult.error`.
 */
export class TodoMoveConflictError extends Error {
  constructor(message = 'Move conflicted or invalid') {
    super(message);
    this.name = 'TodoMoveConflictError';
  }
}

/** Thrown when a todo id is not found (or belongs to another user). */
export class TodoNotFoundError extends Error {
  constructor(message = 'Todo not found') {
    super(message);
    this.name = 'TodoNotFoundError';
  }
}

/** Thrown when a create/move would breach MAX_TODO_DEPTH. */
export class TodoDepthExceededError extends Error {
  constructor(message = 'Todo depth would exceed the maximum') {
    super(message);
    this.name = 'TodoDepthExceededError';
  }
}
