"use client";

import { useCallback } from "react";
import type { Link, Tag, LinkTag } from "@/models/types";
import { createTag, addTagToLink, removeTagFromLink } from "@/actions/tags";

/**
 * Shared callback interface for link mutation operations.
 * Used by both Inbox triage and the inline link editor.
 */
export interface LinkMutationCallbacks {
  onLinkUpdated: (link: Link) => void;
  onTagCreated: (tag: Tag) => void;
  onLinkTagAdded: (linkTag: LinkTag) => void;
  onLinkTagRemoved: (linkId: number, tagId: string) => void;
}

/**
 * Shared hook for tag query + mutation operations on links.
 *
 * Provides optimistic add/remove/create-and-assign tag helpers,
 * plus tag lookup utilities (assigned IDs / assigned Tag objects).
 *
 * Both `useInboxViewModel` and `useInlineLinkEditViewModel` delegate here
 * to eliminate duplicated tag logic.
 */
export function useLinkMutations(
  allTags: Tag[],
  allLinkTags: LinkTag[],
  callbacks: LinkMutationCallbacks,
) {
  // ── Tag queries ──

  /** Get the set of tag IDs assigned to a given link */
  const getAssignedTagIds = useCallback(
    (linkId: number): Set<string> => {
      return new Set(
        allLinkTags.filter((lt) => lt.linkId === linkId).map((lt) => lt.tagId),
      );
    },
    [allLinkTags],
  );

  /** Get the Tag objects assigned to a given link */
  const getAssignedTags = useCallback(
    (linkId: number): Tag[] => {
      const ids = getAssignedTagIds(linkId);
      return allTags.filter((t) => ids.has(t.id));
    },
    [allTags, getAssignedTagIds],
  );

  /** Get tags NOT assigned to a given link (for the tag picker) */
  const getUnassignedTags = useCallback(
    (linkId: number): Tag[] => {
      const ids = getAssignedTagIds(linkId);
      return allTags.filter((t) => !ids.has(t.id));
    },
    [allTags, getAssignedTagIds],
  );

  // ── Tag mutations (optimistic) ──

  /** Add a tag to a link with optimistic rollback */
  const addTag = useCallback(
    async (linkId: number, tagId: string) => {
      callbacks.onLinkTagAdded({ linkId, tagId });
      const result = await addTagToLink(linkId, tagId);
      if (!result.success) {
        callbacks.onLinkTagRemoved(linkId, tagId);
      }
    },
    [callbacks],
  );

  /** Remove a tag from a link with optimistic rollback */
  const removeTag = useCallback(
    async (linkId: number, tagId: string) => {
      callbacks.onLinkTagRemoved(linkId, tagId);
      const result = await removeTagFromLink(linkId, tagId);
      if (!result.success) {
        callbacks.onLinkTagAdded({ linkId, tagId });
      }
    },
    [callbacks],
  );

  /** Create a new tag and immediately assign it to a link */
  const createAndAssignTag = useCallback(
    async (linkId: number, name: string) => {
      const result = await createTag({ name });
      if (result.success && result.data) {
        callbacks.onTagCreated(result.data);
        await addTag(linkId, result.data.id);
      }
      return result;
    },
    [callbacks, addTag],
  );

  return {
    getAssignedTagIds,
    getAssignedTags,
    getUnassignedTags,
    addTag,
    removeTag,
    createAndAssignTag,
  };
}
