"use client";

import { useMemo } from "react";
import type { Link, Tag, LinkTag, Folder } from "@/models/types";
import { useLinkMutations } from "@/viewmodels/useLinkMutations";
import type { LinkMutationCallbacks } from "@/viewmodels/useLinkMutations";

/** Callbacks for syncing triage mutations back to the parent service.
 *  Alias for the shared LinkMutationCallbacks interface.
 */
export type InboxCallbacks = LinkMutationCallbacks;

/** ViewModel for the Inbox triage view — filters uncategorized links and provides tag helpers */
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
    getAssignedTagIds,
    getAssignedTags,
    getUnassignedTags,
    addTag,
    removeTag,
    createAndAssignTag,
  };
}
