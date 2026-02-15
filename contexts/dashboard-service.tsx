"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Link, Folder } from "@/models/types";
import { getLinks } from "@/actions/links";

// ── Service interface ──

export interface DashboardService {
  /** All links for the current user (full in-memory set) */
  links: Link[];
  /** All folders for the current user */
  folders: Folder[];
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
  const [loading, setLoading] = useState(true);
  const siteUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  // Fetch all links on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchLinks() {
      const result = await getLinks();
      if (cancelled) return;
      setLinks(result.data ?? []);
      setLoading(false);
    }
    fetchLinks();
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

  // ── Stable value ──

  const value = useMemo<DashboardService>(
    () => ({
      links,
      folders,
      loading,
      siteUrl,
      handleLinkCreated,
      handleLinkDeleted,
      handleLinkUpdated,
      handleFolderCreated,
      handleFolderDeleted,
      handleFolderUpdated,
    }),
    [
      links,
      folders,
      loading,
      siteUrl,
      handleLinkCreated,
      handleLinkDeleted,
      handleLinkUpdated,
      handleFolderCreated,
      handleFolderDeleted,
      handleFolderUpdated,
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
