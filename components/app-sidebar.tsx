"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PanelLeft, LogOut, Search, FileUp, Plus, Link2, Inbox, BarChart3, Database, Webhook, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FolderIcon } from "@/components/folder-icon";
import { SidebarFolderItem } from "@/components/sidebar-folder-item";
import { SidebarFolderCreate } from "@/components/sidebar-folder-create";
import { SearchCommandDialog } from "@/components/search-command-dialog";
import { APP_VERSION } from "@/lib/version";
import { useFoldersViewModel } from "@/viewmodels/useFoldersViewModel";
import { useDashboardService } from "@/contexts/dashboard-service";
import { buildLinkCounts } from "@/models/links";

/** Nav items for folder filtering — rendered as <Link> */
interface FolderNavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  /** Value to match against ?folder param. null = no param (all links) */
  folderParam: string | null;
}

const FOLDER_NAV_ITEMS: FolderNavItem[] = [
  { title: "全部链接", icon: Link2, href: "/dashboard", folderParam: null },
  { title: "Inbox", icon: Inbox, href: "/dashboard?folder=uncategorized", folderParam: "uncategorized" },
];

/** Static nav items rendered as <Link> */
interface StaticNavItem {
  title: string;
  icon: React.ElementType;
  href: string;
}

interface NavGroup {
  label: string;
  items: StaticNavItem[];
}

/** Nav groups rendered ABOVE the 链接管理 section */
const PRE_LINK_NAV_GROUPS: NavGroup[] = [
  {
    label: "概览",
    items: [
      { title: "概览", icon: BarChart3, href: "/dashboard/overview" },
    ],
  },
];

/** Nav groups rendered BELOW the 链接管理 section */
const OTHER_NAV_GROUPS: NavGroup[] = [
  {
    label: "文件管理",
    items: [
      { title: "文件上传", icon: FileUp, href: "/dashboard/uploads" },
    ],
  },
  {
    label: "系统",
    items: [
      { title: "存储", icon: HardDrive, href: "/dashboard/storage" },
      { title: "数据管理", icon: Database, href: "/dashboard/data-management" },
      { title: "Webhook", icon: Webhook, href: "/dashboard/webhook" },
    ],
  },
];

export interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  signOutAction: () => Promise<void>;
}

export function AppSidebar({
  collapsed,
  onToggle,
  user,
  signOutAction,
}: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFolder = pathname === "/dashboard" ? (searchParams.get("folder") ?? null) : "__other__";

  const foldersVm = useFoldersViewModel();
  const { links } = useDashboardService();
  const linkCounts = useMemo(() => buildLinkCounts(links), [links]);

  // Search dialog state (pure UI — not in service)
  const [searchOpen, setSearchOpen] = useState(false);

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

  /** Whether a folder nav item is active, based on URL */
  function isFolderNavActive(folderParam: string | null): boolean {
    return currentFolder === folderParam;
  }

  if (collapsed) {
    return (
      <aside className="sticky top-0 flex h-screen w-[68px] shrink-0 flex-col items-center bg-background transition-all duration-300 ease-in-out overflow-hidden">
        <div className="flex h-14 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-24.png"
              alt="Zhe"
              width={24}
              height={24}
              className="shrink-0"
            />
        </div>

        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
        >
          <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
          {/* Pre-link nav items (概览 etc.) */}
          {PRE_LINK_NAV_GROUPS.flatMap((g) => g.items).map((item) => (
            <Tooltip key={item.href} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                    pathname === item.href
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.title}
              </TooltipContent>
            </Tooltip>
          ))}

          {/* Folder nav items as links */}
          {FOLDER_NAV_ITEMS.map((item) => (
            <Tooltip key={item.title} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                    isFolderNavActive(item.folderParam)
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.title}
              </TooltipContent>
            </Tooltip>
          ))}

          {/* Dynamic folder items */}
          {foldersVm.folders.map((folder) => (
            <Tooltip key={folder.id} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={`/dashboard?folder=${folder.id}`}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                    currentFolder === folder.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <FolderIcon name={folder.icon} className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {folder.name}
              </TooltipContent>
            </Tooltip>
          ))}

          {/* Other static nav items (文件上传 etc.) */}
          {OTHER_NAV_GROUPS.flatMap((g) => g.items).map((item) => (
            <Tooltip key={item.href} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                    pathname === item.href
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.title}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        <div className="py-3 flex justify-center w-full">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Avatar className="h-9 w-9 cursor-pointer">
                {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
                <AvatarFallback className="text-xs">
                  {user?.name?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {user?.name || "User"}
            </TooltipContent>
          </Tooltip>
        </div>
        <SearchCommandDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden">
      {/* Header */}
      <div className="px-3 h-14 flex items-center">
        <div className="flex w-full items-center justify-between px-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-24.png"
              alt="Zhe"
              width={24}
              height={24}
              className="shrink-0"
            />
            <span className="text-lg md:text-xl font-semibold text-foreground">
              ZHE.TO
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
              v{APP_VERSION}
            </Badge>
          </div>
          <button
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Search button */}
      <div className="px-3 pb-1">
        <button
          onClick={openSearch}
          className="flex w-full items-center gap-3 rounded-lg bg-secondary px-3 py-1.5 cursor-pointer"
        >
          <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <span className="flex-1 text-left text-sm text-muted-foreground">
            搜索链接...
          </span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Search command dialog */}
      <SearchCommandDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto pt-2">
        {/* Pre-link nav groups (概览 etc.) */}
        {PRE_LINK_NAV_GROUPS.map((group) => (
          <div key={group.label} className="px-3 mb-1">
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-sm font-normal text-muted-foreground">
                {group.label}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
                    pathname === item.href
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 text-left">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* 链接管理 group */}
        <div className="px-3 mb-1">
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm font-normal text-muted-foreground">
              链接管理
            </span>
            <button
              onClick={() => foldersVm.setIsCreating(true)}
              aria-label="新建文件夹"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {/* "全部链接" and "未分类" as links */}
            {FOLDER_NAV_ITEMS.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
                  isFolderNavActive(item.folderParam)
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span className="flex-1 text-left">{item.title}</span>
                <span className="flex w-5 shrink-0 items-center justify-center">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {item.folderParam === null ? linkCounts.total : linkCounts.uncategorized}
                  </span>
                </span>
              </Link>
            ))}

            {/* Dynamic folder items */}
            {foldersVm.folders.map((folder) => (
              <SidebarFolderItem
                key={folder.id}
                folder={folder}
                linkCount={linkCounts.byFolder.get(folder.id) ?? 0}
                isSelected={currentFolder === folder.id}
                isEditing={foldersVm.editingFolderId === folder.id}
                onStartEditing={foldersVm.startEditing}
                onUpdate={foldersVm.handleUpdateFolder}
                onDelete={foldersVm.handleDeleteFolder}
                onCancelEditing={foldersVm.cancelEditing}
              />
            ))}

            {/* Inline create form */}
            {foldersVm.isCreating && (
              <SidebarFolderCreate
                onCreate={foldersVm.handleCreateFolder}
                onCancel={() => foldersVm.setIsCreating(false)}
              />
            )}
          </div>
        </div>

        {/* Other nav groups (文件管理 etc.) */}
        {OTHER_NAV_GROUPS.map((group) => (
          <div key={group.label} className="px-3 mb-1">
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-sm font-normal text-muted-foreground">
                {group.label}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
                    pathname === item.href
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 text-left">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
            <AvatarFallback className="text-xs">
              {user?.name?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
