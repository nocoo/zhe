"use client";

import {
  createContext,
  useContext,
  useMemo,
} from "react";
import type { Link, Folder, Tag, LinkTag } from "@/models/types";
import type { IdeaListItem } from "@/lib/db/scoped";
import { useDashboardCore } from "./dashboard-service-parts/useDashboardCore";
import { useIdeasSlice } from "./dashboard-service-parts/useIdeasSlice";

// ── State interface (changes on every data mutation) ──

export interface DashboardState {
  /** All links for the current user (full in-memory set) */
  links: Link[];
  /** All folders for the current user */
  folders: Folder[];
  /** All tags for the current user */
  tags: Tag[];
  /** All link-tag associations for the current user */
  linkTags: LinkTag[];
  /** All ideas for the current user (list shape, no full content) */
  ideas: IdeaListItem[];
  /** True while the initial links fetch is in progress */
  loading: boolean;
  /** True while ideas are being fetched (lazy-loaded) */
  ideasLoading: boolean;
  /** Site origin for building short URLs */
  siteUrl: string;
}

// ── Actions interface (stable callback refs) ──

export interface DashboardActions {
  // Links — call after server action succeeds to sync memory
  handleLinkCreated: (link: Link) => void;
  handleLinkDeleted: (id: number) => void;
  handleLinkUpdated: (link: Link) => void;
  /** Re-fetch all links from the server. Resolves to a result so callers
   *  can show success/failure feedback (e.g. a toast). */
  refreshLinks: () => Promise<{ success: boolean; error?: string }>;

  // Folders — call after server action succeeds to sync memory
  handleFolderCreated: (folder: Folder) => void;
  handleFolderDeleted: (id: string) => void;
  handleFolderUpdated: (folder: Folder) => void;

  // Tags — call after server action succeeds to sync memory
  handleTagCreated: (tag: Tag) => void;
  handleTagDeleted: (id: string) => void;
  handleTagUpdated: (tag: Tag) => void;

  // Link-Tags — call after server action succeeds to sync memory
  handleLinkTagAdded: (linkTag: LinkTag) => void;
  handleLinkTagRemoved: (linkId: number, tagId: string) => void;

  // Ideas — lazy-loaded and memory sync
  /** Lazy-load ideas on first access (for global search, etc.) */
  ensureIdeasLoaded: () => Promise<void>;
  /** Re-fetch all ideas from the server */
  refreshIdeas: () => Promise<void>;
  handleIdeaCreated: (idea: IdeaListItem) => void;
  handleIdeaDeleted: (id: number) => void;
  handleIdeaUpdated: (idea: IdeaListItem) => void;
}

// ── Combined interface (backward-compatible) ──

export type DashboardService = DashboardState & DashboardActions;

// ── Contexts ──

const DashboardStateContext = createContext<DashboardState | null>(null);
const DashboardActionsContext = createContext<DashboardActions | null>(null);

// ── Provider ──

export interface DashboardServiceProviderProps {
  /** SSR-preloaded folders from layout */
  initialFolders: Folder[];
  children: React.ReactNode;
}

export function DashboardServiceProvider({
  initialFolders,
  children,
}: DashboardServiceProviderProps) {
  const core = useDashboardCore(initialFolders);
  const ideasSlice = useIdeasSlice();
  const siteUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  // ── Stable state value (changes when data changes) ──
  const stateValue = useMemo<DashboardState>(
    () => ({
      links: core.links,
      folders: core.folders,
      tags: core.tags,
      linkTags: core.linkTags,
      ideas: ideasSlice.ideas,
      loading: core.loading,
      ideasLoading: ideasSlice.ideasLoading,
      siteUrl,
    }),
    [
      core.links,
      core.folders,
      core.tags,
      core.linkTags,
      core.loading,
      ideasSlice.ideas,
      ideasSlice.ideasLoading,
      siteUrl,
    ],
  );

  // ── Stable actions value (never changes — all callbacks have [] deps) ──
  const actionsValue = useMemo<DashboardActions>(
    () => ({
      handleLinkCreated: core.handleLinkCreated,
      handleLinkDeleted: core.handleLinkDeleted,
      handleLinkUpdated: core.handleLinkUpdated,
      refreshLinks: core.refreshLinks,
      handleFolderCreated: core.handleFolderCreated,
      handleFolderDeleted: core.handleFolderDeleted,
      handleFolderUpdated: core.handleFolderUpdated,
      handleTagCreated: core.handleTagCreated,
      handleTagDeleted: core.handleTagDeleted,
      handleTagUpdated: core.handleTagUpdated,
      handleLinkTagAdded: core.handleLinkTagAdded,
      handleLinkTagRemoved: core.handleLinkTagRemoved,
      ensureIdeasLoaded: ideasSlice.ensureIdeasLoaded,
      refreshIdeas: ideasSlice.refreshIdeas,
      handleIdeaCreated: ideasSlice.handleIdeaCreated,
      handleIdeaDeleted: ideasSlice.handleIdeaDeleted,
      handleIdeaUpdated: ideasSlice.handleIdeaUpdated,
    }),
    [core, ideasSlice],
  );

  return (
    <DashboardActionsContext.Provider value={actionsValue}>
      <DashboardStateContext.Provider value={stateValue}>
        {children}
      </DashboardStateContext.Provider>
    </DashboardActionsContext.Provider>
  );
}

// ── Hooks ──

/** Subscribe to state only — does NOT re-render on action ref changes */
export function useDashboardState(): DashboardState {
  const ctx = useContext(DashboardStateContext);
  if (!ctx) {
    throw new Error(
      "useDashboardState must be used within a DashboardServiceProvider",
    );
  }
  return ctx;
}

/** Subscribe to actions only — never causes re-renders (refs are stable) */
export function useDashboardActions(): DashboardActions {
  const ctx = useContext(DashboardActionsContext);
  if (!ctx) {
    throw new Error(
      "useDashboardActions must be used within a DashboardServiceProvider",
    );
  }
  return ctx;
}

/** Combined hook (backward-compatible) — subscribes to BOTH contexts */
export function useDashboardService(): DashboardService {
  const state = useDashboardState();
  const actions = useDashboardActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
