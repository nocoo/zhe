"use client";

import { useState, useCallback, useMemo } from "react";
import type { Link, Tag, LinkTag, Folder } from "@/models/types";
import { updateLink, updateLinkNote } from "@/actions/links";
import { createTag, addTagToLink, removeTagFromLink } from "@/actions/tags";

/** Per-link draft state for inline triage editing */
export interface InboxItemDraft {
  folderId: string | undefined;
  note: string;
  /** True while a save is in flight */
  isSaving: boolean;
  error: string;
}

/** Callbacks for syncing triage mutations back to the parent service */
export interface InboxCallbacks {
  onLinkUpdated: (link: Link) => void;
  onTagCreated: (tag: Tag) => void;
  onLinkTagAdded: (linkTag: LinkTag) => void;
  onLinkTagRemoved: (linkId: number, tagId: string) => void;
}

/** ViewModel for the Inbox triage view — manages inline editing of uncategorized links */
export function useInboxViewModel(
  links: Link[],
  folders: Folder[],
  allTags: Tag[],
  allLinkTags: LinkTag[],
  callbacks: InboxCallbacks,
) {
  // Filter to uncategorized (inbox) links
  const inboxLinks = useMemo(
    () => links.filter((l) => l.folderId === null),
    [links],
  );

  // Per-link draft state: linkId -> InboxItemDraft
  const [drafts, setDrafts] = useState<Map<number, InboxItemDraft>>(new Map());

  /** Get the draft for a link, or create a default one lazily */
  const getDraft = useCallback(
    (linkId: number): InboxItemDraft => {
      const existing = drafts.get(linkId);
      if (existing) return existing;
      const link = inboxLinks.find((l) => l.id === linkId);
      return {
        folderId: undefined,
        note: link?.note ?? "",
        isSaving: false,
        error: "",
      };
    },
    [drafts, inboxLinks],
  );

  /** Update a single field in a link's draft */
  const updateDraft = useCallback(
    (linkId: number, patch: Partial<InboxItemDraft>) => {
      setDrafts((prev) => {
        const next = new Map(prev);
        const current = next.get(linkId) ?? {
          folderId: undefined,
          note: inboxLinks.find((l) => l.id === linkId)?.note ?? "",
          isSaving: false,
          error: "",
        };
        next.set(linkId, { ...current, ...patch });
        return next;
      });
    },
    [inboxLinks],
  );

  /** Set the folder for a draft */
  const setDraftFolderId = useCallback(
    (linkId: number, folderId: string | undefined) => {
      updateDraft(linkId, { folderId });
    },
    [updateDraft],
  );

  /** Set the note for a draft */
  const setDraftNote = useCallback(
    (linkId: number, note: string) => {
      updateDraft(linkId, { note });
    },
    [updateDraft],
  );

  /** Save a single link's triage edits (folder + note) */
  const saveItem = useCallback(
    async (linkId: number) => {
      const link = inboxLinks.find((l) => l.id === linkId);
      if (!link) return;

      const draft = getDraft(linkId);
      updateDraft(linkId, { isSaving: true, error: "" });

      try {
        // Update link (folder assignment)
        const payload: { originalUrl: string; folderId?: string } = {
          originalUrl: link.originalUrl,
          folderId: draft.folderId,
        };

        const linkResult = await updateLink(link.id, payload);
        if (!linkResult.success || !linkResult.data) {
          updateDraft(linkId, {
            isSaving: false,
            error: linkResult.error || "Failed to update link",
          });
          return;
        }

        // Update note if changed
        const currentNote = link.note ?? "";
        if (draft.note !== currentNote) {
          const noteResult = await updateLinkNote(
            link.id,
            draft.note.trim() || null,
          );
          if (!noteResult.success) {
            updateDraft(linkId, {
              isSaving: false,
              error: noteResult.error || "Failed to update note",
            });
            return;
          }
        }

        // Merge note into updated link for the callback
        const updatedLink: Link = {
          ...linkResult.data,
          note: draft.note.trim() || null,
        };
        callbacks.onLinkUpdated(updatedLink);

        // Clean up draft — link will disappear from inboxLinks if folder was set
        setDrafts((prev) => {
          const next = new Map(prev);
          next.delete(linkId);
          return next;
        });
      } catch {
        updateDraft(linkId, {
          isSaving: false,
          error: "An unexpected error occurred",
        });
      }
    },
    [inboxLinks, getDraft, updateDraft, callbacks],
  );

  // ── Tag helpers (per-link, same optimistic pattern as edit dialog) ──

  /** Get tags assigned to a specific link */
  const getAssignedTagIds = useCallback(
    (linkId: number): Set<string> => {
      return new Set(
        allLinkTags.filter((lt) => lt.linkId === linkId).map((lt) => lt.tagId),
      );
    },
    [allLinkTags],
  );

  const getAssignedTags = useCallback(
    (linkId: number): Tag[] => {
      const ids = getAssignedTagIds(linkId);
      return allTags.filter((t) => ids.has(t.id));
    },
    [allTags, getAssignedTagIds],
  );

  /** Add a tag to a link (optimistic) */
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

  /** Remove a tag from a link (optimistic) */
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
    inboxLinks,
    folders,
    allTags,
    getDraft,
    setDraftFolderId,
    setDraftNote,
    saveItem,
    getAssignedTagIds,
    getAssignedTags,
    addTag,
    removeTag,
    createAndAssignTag,
  };
}
