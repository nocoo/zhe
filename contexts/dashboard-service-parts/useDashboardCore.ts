"use client";

import { useCallback, useEffect, useState } from "react";
import type { Link, Folder, Tag, LinkTag } from "@/models/types";
import { getDashboardData } from "@/actions/dashboard";
import { getLinks } from "@/actions/links";

/** Mount-effect: load links/tags/linkTags via a single server action. */
function useInitialFetch(
  setLinks: (v: Link[]) => void,
  setTags: (v: Tag[]) => void,
  setLinkTags: (v: LinkTag[]) => void,
  setLoading: (v: boolean) => void,
) {
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
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Owns the base dashboard state (links/folders/tags/linkTags) and exposes
 * the mutation handlers + initial fetch. Cascading mutations (folder/tag
 * delete) live here so they can update multiple slices atomically.
 */
export function useDashboardCore(initialFolders: Folder[]) {
  const [links, setLinks] = useState<Link[]>([]);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [tags, setTags] = useState<Tag[]>([]);
  const [linkTags, setLinkTags] = useState<LinkTag[]>([]);
  const [loading, setLoading] = useState(true);

  useInitialFetch(setLinks, setTags, setLinkTags, setLoading);

  // ── Links handlers ──
  const handleLinkCreated = useCallback((link: Link) => {
    setLinks((prev) => [link, ...prev]);
  }, []);
  const handleLinkDeleted = useCallback((id: number) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }, []);
  const handleLinkUpdated = useCallback((updatedLink: Link) => {
    setLinks((prev) => prev.map((l) => (l.id === updatedLink.id ? updatedLink : l)));
  }, []);
  const refreshLinks = useCallback(async () => {
    const result = await getLinks();
    if (result.success && result.data) setLinks(result.data);
  }, []);

  // ── Folders handlers (with cascade onto links) ──
  const handleFolderCreated = useCallback((folder: Folder) => {
    setFolders((prev) => [...prev, folder]);
  }, []);
  const handleFolderDeleted = useCallback((id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    // Cascade: clear folderId on associated links (mirrors DB SET NULL)
    setLinks((prev) => prev.map((l) => (l.folderId === id ? { ...l, folderId: null } : l)));
  }, []);
  const handleFolderUpdated = useCallback((updatedFolder: Folder) => {
    setFolders((prev) => prev.map((f) => (f.id === updatedFolder.id ? updatedFolder : f)));
  }, []);

  // ── Tags handlers (with cascade onto link-tags) ──
  const handleTagCreated = useCallback((tag: Tag) => {
    setTags((prev) => [...prev, tag]);
  }, []);
  const handleTagDeleted = useCallback((id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id));
    setLinkTags((prev) => prev.filter((lt) => lt.tagId !== id));
  }, []);
  const handleTagUpdated = useCallback((updatedTag: Tag) => {
    setTags((prev) => prev.map((t) => (t.id === updatedTag.id ? updatedTag : t)));
  }, []);

  // ── Link-Tags handlers ──
  const handleLinkTagAdded = useCallback((linkTag: LinkTag) => {
    setLinkTags((prev) => [...prev, linkTag]);
  }, []);
  const handleLinkTagRemoved = useCallback((linkId: number, tagId: string) => {
    setLinkTags((prev) =>
      prev.filter((lt) => !(lt.linkId === linkId && lt.tagId === tagId)),
    );
  }, []);

  return {
    links,
    folders,
    tags,
    linkTags,
    loading,
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
  };
}
