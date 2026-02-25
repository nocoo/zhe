"use client";

import { useState, useCallback, useMemo } from "react";
import type { Link, Tag, LinkTag, Folder } from "@/models/types";
import { updateLink, updateLinkNote } from "@/actions/links";
import { useLinkMutations } from "@/viewmodels/useLinkMutations";
import type { LinkMutationCallbacks } from "@/viewmodels/useLinkMutations";

/** Per-link draft state for inline triage editing */
export interface InboxItemDraft {
  folderId: string | undefined;
  note: string;
  /** True while a save is in flight */
  isSaving: boolean;
  error: string;
}

/** Callbacks for syncing triage mutations back to the parent service.
 *  Alias for the shared LinkMutationCallbacks interface.
 */
export type InboxCallbacks = LinkMutationCallbacks;

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

  // ── Tag helpers — delegated to shared useLinkMutations hook ──
  const {
    getAssignedTagIds,
    getAssignedTags,
    getUnassignedTags,
    addTag,
    removeTag,
    createAndAssignTag,
  } = useLinkMutations(allTags, allLinkTags, callbacks);

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
    getUnassignedTags,
    addTag,
    removeTag,
    createAndAssignTag,
  };
}
