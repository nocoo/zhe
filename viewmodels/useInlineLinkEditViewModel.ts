"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { updateLink } from "@/actions/links";
import type { Link, LinkTag, Tag } from "@/models/types";
import type { LinkMutationCallbacks } from "@/viewmodels/useLinkMutations";
import { useLinkMutations } from "@/viewmodels/useLinkMutations";

/** Callbacks for syncing edit mutations back to the parent service.
 *  Alias for the shared LinkMutationCallbacks interface.
 */
export type EditLinkCallbacks = LinkMutationCallbacks;

interface EditFields {
  editUrl: string;
  editSlug: string;
  editFolderId: string | null;
  editTitle: string;
  editNote: string;
  editScreenshotUrl: string;
}

/**
 * Build the link-update payload from the current form state. Only includes
 * fields that differ from the original link.
 */
function buildUpdatePayload(link: Link, fields: EditFields) {
  const payload: {
    title?: string | null;
    note?: string | null;
    originalUrl: string;
    folderId?: string | null;
    slug?: string;
    screenshotUrl?: string | null;
  } = {
    originalUrl: fields.editUrl,
  };
  if (fields.editFolderId !== link.folderId) {
    payload.folderId = fields.editFolderId ?? null;
  }
  if (fields.editSlug !== link.slug) {
    payload.slug = fields.editSlug;
  }
  const currentScreenshotUrl = link.screenshotUrl ?? "";
  if (fields.editScreenshotUrl !== currentScreenshotUrl) {
    payload.screenshotUrl = fields.editScreenshotUrl.trim() || null;
  }
  if (fields.editTitle !== (link.title ?? "")) payload.title = fields.editTitle.trim() || null;
  if (fields.editNote !== (link.note ?? "")) payload.note = fields.editNote.trim() || null;
  return payload;
}

/**
 * Save link fields, including the curated title and note, together.
 */
async function executeSave(
  link: Link,
  fields: EditFields,
): Promise<{
  ok: boolean;
  updatedLink?: Link;
  errorMessage?: string;
}> {
  const payload = buildUpdatePayload(link, fields);
  const linkResult = await updateLink(link.id, payload);
  if (!linkResult.success || !linkResult.data) {
    return { ok: false, errorMessage: linkResult.error || "Failed to update link" };
  }

  return { ok: true, updatedLink: linkResult.data };
}

/** ViewModel for inline link editing — manages URL, folder, note, tags & save. */
export function useInlineLinkEditViewModel(
  link: Link,
  allTags: Tag[],
  allLinkTags: LinkTag[],
  callbacks: EditLinkCallbacks,
) {
  // Form fields — initialised from the link
  const [editUrl, setEditUrl] = useState(link.originalUrl);
  const [editSlug, setEditSlug] = useState(link.slug);
  const [editFolderId, setEditFolderId] = useState<string | null>(link.folderId ?? null);
  const [editTitle, setEditTitle] = useState(link.title ?? "");
  const [editNote, setEditNote] = useState(link.note ?? "");
  const [editScreenshotUrl, setEditScreenshotUrl] = useState(link.screenshotUrl ?? "");

  // Re-sync form fields when the underlying link data changes
  useEffect(() => {
    setEditUrl(link.originalUrl);
    setEditSlug(link.slug);
    setEditFolderId(link.folderId ?? null);
    setEditTitle(link.title ?? "");
    setEditNote(link.note ?? "");
    setEditScreenshotUrl(link.screenshotUrl ?? "");
  }, [link.originalUrl, link.slug, link.folderId, link.title, link.note, link.screenshotUrl]);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const mutations = useLinkMutations(allTags, allLinkTags, callbacks);

  const assignedTagIds = useMemo(() => mutations.getAssignedTagIds(link.id), [link.id, mutations]);
  const assignedTags = useMemo(
    () => allTags.filter((t) => assignedTagIds.has(t.id)),
    [allTags, assignedTagIds],
  );

  const saveEdit = useCallback(async () => {
    setIsSaving(true);
    setError("");
    try {
      const fields: EditFields = {
        editUrl,
        editSlug,
        editFolderId,
        editTitle,
        editNote,
        editScreenshotUrl,
      };
      const result = await executeSave(link, fields);
      if (!result.ok || !result.updatedLink) {
        setError(result.errorMessage || "Failed to update link");
        return false;
      }
      callbacks.onLinkUpdated(result.updatedLink);
      return true;
    } catch {
      setError("An unexpected error occurred");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [link, editUrl, editSlug, editFolderId, editTitle, editNote, editScreenshotUrl, callbacks]);

  const addTag = useCallback(
    async (tagId: string) => {
      await mutations.addTag(link.id, tagId);
    },
    [link.id, mutations],
  );
  const removeTag = useCallback(
    async (tagId: string) => {
      await mutations.removeTag(link.id, tagId);
    },
    [link.id, mutations],
  );
  const createAndAssignTag = useCallback(
    async (name: string) => mutations.createAndAssignTag(link.id, name),
    [link.id, mutations],
  );

  return {
    editUrl,
    setEditUrl,
    editSlug,
    setEditSlug,
    editFolderId,
    setEditFolderId,
    editTitle,
    setEditTitle,
    editNote,
    setEditNote,
    editScreenshotUrl,
    setEditScreenshotUrl,
    isSaving,
    error,
    assignedTagIds,
    assignedTags,
    saveEdit,
    addTag,
    removeTag,
    createAndAssignTag,
  };
}
