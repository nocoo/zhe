"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Link, Folder, Tag, LinkTag } from "@/models/types";
import { getDashboardData } from "@/actions/dashboard";
import { getLinks } from "@/actions/links";

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
  /** True while the initial links fetch is in progress */
  loading: boolean;
  /** Site origin for building short URLs */
  siteUrl: string;
}

// ── Actions interface (stable callback refs) ──

export interface DashboardActions {
  // Links — call after server action succeeds to sync memory
  handleLinkCreated: (link: Link) => void;
  handleLinkDeleted: (id: number) => void;
  handleLinkUpdated: (link: Link) => void;
  /** Re-fetch all links from the server */
  refreshLinks: () => Promise<void>;

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
  const [links, setLinks] = useState<Link[]>([]);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [tags, setTags] = useState<Tag[]>([]);
  const [linkTags, setLinkTags] = useState<LinkTag[]>([]);
  const [loading, setLoading] = useState(true);
  const siteUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  // Fetch all links, tags, and link-tags in a single server action call
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const result = await getDashboardData();
        if (cancelled) return;
        if (result.success && result.data) {
          setLinks(result.data.links);
          setTags(result.data.tags);
          setLinkTags(result.data.linkTags);
        }
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Links CRUD (memory sync) ──

  const handleLinkCreated = useCallback((link: Link) => {
    setLinks((prev) => [link, ...prev]);
  }, []);

  const handleLinkDeleted = useCallback((id: number) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleLinkUpdated = useCallback((updatedLink: Link) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === updatedLink.id ? updatedLink : l)),
    );
  }, []);

  const refreshLinks = useCallback(async () => {
    const result = await getLinks();
    setLinks(result.data ?? []);
  }, []);

  // ── Folders CRUD (memory sync) ──

  const handleFolderCreated = useCallback((folder: Folder) => {
    setFolders((prev) => [...prev, folder]);
  }, []);

  const handleFolderDeleted = useCallback((id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    // Cascade: clear folderId on associated links (mirrors DB SET NULL)
    setLinks((prev) =>
      prev.map((l) => (l.folderId === id ? { ...l, folderId: null } : l)),
    );
  }, []);

  const handleFolderUpdated = useCallback((updatedFolder: Folder) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === updatedFolder.id ? updatedFolder : f)),
    );
  }, []);

  // ── Tags CRUD (memory sync) ──

  const handleTagCreated = useCallback((tag: Tag) => {
    setTags((prev) => [...prev, tag]);
  }, []);

  const handleTagDeleted = useCallback((id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id));
    // Cascade: remove link-tag associations for deleted tag
    setLinkTags((prev) => prev.filter((lt) => lt.tagId !== id));
  }, []);

  const handleTagUpdated = useCallback((updatedTag: Tag) => {
    setTags((prev) =>
      prev.map((t) => (t.id === updatedTag.id ? updatedTag : t)),
    );
  }, []);

  // ── Link-Tags association (memory sync) ──

  const handleLinkTagAdded = useCallback((linkTag: LinkTag) => {
    setLinkTags((prev) => [...prev, linkTag]);
  }, []);

  const handleLinkTagRemoved = useCallback((linkId: number, tagId: string) => {
    setLinkTags((prev) =>
      prev.filter((lt) => !(lt.linkId === linkId && lt.tagId === tagId)),
    );
  }, []);

  // ── Stable state value (changes when data changes) ──

  const stateValue = useMemo<DashboardState>(
    () => ({
      links,
      folders,
      tags,
      linkTags,
      loading,
      siteUrl,
    }),
    [links, folders, tags, linkTags, loading, siteUrl],
  );

  // ── Stable actions value (never changes — all callbacks have [] deps) ──

  const actionsValue = useMemo<DashboardActions>(
    () => ({
      handleLinkCreated,
      handleLinkDeleted,
      handleLinkUpdated,
      refreshLinks,
      handleFolderCreated,
      handleFolderDeleted,
      handleFolderUpdated,
      handleTagCreated,
      handleTagDeleted,
      handleTagUpdated,
      handleLinkTagAdded,
      handleLinkTagRemoved,
    }),
    [
      handleLinkCreated,
      handleLinkDeleted,
      handleLinkUpdated,
      refreshLinks,
      handleFolderCreated,
      handleFolderDeleted,
      handleFolderUpdated,
      handleTagCreated,
      handleTagDeleted,
      handleTagUpdated,
      handleLinkTagAdded,
      handleLinkTagRemoved,
    ],
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
