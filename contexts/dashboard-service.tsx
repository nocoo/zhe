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
import { getLinks } from "@/actions/links";
import { getTags, getLinkTags } from "@/actions/tags";

// ── Service interface ──

export interface DashboardService {
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

  // Links — call after server action succeeds to sync memory
  handleLinkCreated: (link: Link) => void;
  handleLinkDeleted: (id: number) => void;
  handleLinkUpdated: (link: Link) => void;

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

// ── Context ──

const DashboardServiceContext = createContext<DashboardService | null>(null);

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

  // Fetch all links, tags, and link-tags on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const [linksResult, tagsResult, linkTagsResult] = await Promise.all([
        getLinks(),
        getTags(),
        getLinkTags(),
      ]);
      if (cancelled) return;
      setLinks(linksResult.data ?? []);
      setTags(tagsResult.data ?? []);
      setLinkTags(linkTagsResult.data ?? []);
      setLoading(false);
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

  // ── Stable value ──

  const value = useMemo<DashboardService>(
    () => ({
      links,
      folders,
      tags,
      linkTags,
      loading,
      siteUrl,
      handleLinkCreated,
      handleLinkDeleted,
      handleLinkUpdated,
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
      links,
      folders,
      tags,
      linkTags,
      loading,
      siteUrl,
      handleLinkCreated,
      handleLinkDeleted,
      handleLinkUpdated,
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
    <DashboardServiceContext.Provider value={value}>
      {children}
    </DashboardServiceContext.Provider>
  );
}

// ── Hook ──

export function useDashboardService(): DashboardService {
  const ctx = useContext(DashboardServiceContext);
  if (!ctx) {
    throw new Error(
      "useDashboardService must be used within a DashboardServiceProvider",
    );
  }
  return ctx;
}
