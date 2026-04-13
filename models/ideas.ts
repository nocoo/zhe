/**
 * Ideas model utilities for filtering and display.
 */

import type { IdeaListItem } from "@/lib/db/scoped";
import type { Tag } from "@/models/types";

/** Context for tag-aware search */
export interface IdeaFilterContext {
  tags: Tag[];
}

/**
 * Filter ideas by substring match on title, excerpt, or tag name (case-insensitive).
 *
 * Returns an empty array when the query is empty or whitespace-only
 * (to avoid returning the entire dataset as a no-op).
 *
 * When `ctx` is provided, tag names associated with each idea are also searched.
 */
export function filterIdeas(
  ideas: IdeaListItem[],
  query: string,
  ctx?: IdeaFilterContext,
): IdeaListItem[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return [];

  // Pre-build a tagId → tag name lookup for O(1) access
  let tagNameById: Map<string, string> | undefined;
  if (ctx) {
    tagNameById = new Map();
    for (const tag of ctx.tags) {
      tagNameById.set(tag.id, tag.name.toLowerCase());
    }
  }

  return ideas.filter((idea) => {
    // Title
    if (idea.title?.toLowerCase().includes(trimmed)) return true;
    // Excerpt
    if (idea.excerpt?.toLowerCase().includes(trimmed)) return true;
    // Tag names (ideas store tagIds directly)
    if (tagNameById && idea.tagIds.length > 0) {
      for (const tagId of idea.tagIds) {
        const name = tagNameById.get(tagId);
        if (name?.includes(trimmed)) return true;
      }
    }
    return false;
  });
}
