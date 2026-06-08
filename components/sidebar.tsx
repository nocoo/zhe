"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSidebar } from "@/components/sidebar-context";
import { useFoldersViewModel } from "@/viewmodels/useFoldersViewModel";
import { useDashboardState } from "@/contexts/dashboard-service";
import { buildLinkCounts } from "@/models/links";
import { SidebarCollapsed } from "./sidebar-parts/sidebar-collapsed";
import { SidebarExpanded } from "./sidebar-parts/sidebar-expanded";

export interface SidebarProps {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  signOutAction: () => Promise<void>;
}

export function Sidebar({ user, signOutAction }: SidebarProps) {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFolder =
    pathname === "/dashboard" ? (searchParams.get("folder") ?? null) : "__other__";

  const foldersVm = useFoldersViewModel();
  const { links } = useDashboardState();
  const linkCounts = useMemo(() => buildLinkCounts(links), [links]);

  const [searchOpen, setSearchOpen] = useState(false);

  // Collapsible group state — all default open
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({
    概览: true,
    链接管理: true,
    工具: true,
    集成: true,
    设置: true,
  });
  const toggleGroup = useCallback(
    (label: string) =>
      setGroupOpen((prev) => ({ ...prev, [label]: !prev[label] })),
    [],
  );

  // Cmd+K / Ctrl+K global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openSearch = useCallback(() => setSearchOpen(true), []);

  if (collapsed) {
    return (
      <SidebarCollapsed
        pathname={pathname}
        currentFolder={currentFolder}
        user={user}
        folders={foldersVm.folders}
        onToggle={toggle}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
      />
    );
  }

  return (
    <SidebarExpanded
      pathname={pathname}
      currentFolder={currentFolder}
      user={user}
      signOutAction={signOutAction}
      folders={foldersVm.folders}
      foldersVm={foldersVm}
      linkCounts={linkCounts}
      groupOpen={groupOpen}
      toggleGroup={toggleGroup}
      onToggle={toggle}
      searchOpen={searchOpen}
      setSearchOpen={setSearchOpen}
      openSearch={openSearch}
    />
  );
}
