"use client";

import { useMemo } from "react";
import {
  DEFAULT_SPECIAL_SOURCES,
  matchesSpecialSources,
  type SpecialSources,
} from "@/models/special-sources";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import type { LinkMutationCallbacks } from "@/viewmodels/useLinkMutations";
import { useLinkMutations } from "@/viewmodels/useLinkMutations";

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
  sources: SpecialSources = DEFAULT_SPECIAL_SOURCES,
) {
  // Filter to uncategorized (inbox) links
  const inboxLinks = useMemo(
    () => links.filter((l) => l.folderId === null && matchesSpecialSources(l.originalUrl, sources)),
    [links, sources],
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
