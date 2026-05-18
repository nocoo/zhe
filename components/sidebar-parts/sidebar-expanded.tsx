"use client";

import { PanelLeft, LogOut, Search, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarFolderItem } from "@/components/sidebar-folder-item";
import { SidebarFolderCreate } from "@/components/sidebar-folder-create";
import { SearchCommandDialog } from "@/components/search-command-dialog";
import { APP_VERSION } from "@/lib/version";
import { CollapsibleNavGroup } from "./collapsible-nav-group";
import {
  PRE_LINK_NAV_GROUPS,
  OTHER_NAV_GROUPS,
  FOLDER_NAV_ITEMS,
  type NavGroup,
} from "./nav-config";
import type { Folder } from "@/models/types";
import type { useFoldersViewModel } from "@/viewmodels/useFoldersViewModel";
import type { buildLinkCounts } from "@/models/links";

type FoldersVm = ReturnType<typeof useFoldersViewModel>;
type LinkCounts = ReturnType<typeof buildLinkCounts>;

interface SidebarExpandedProps {
  pathname: string;
  currentFolder: string | null | "__other__";
  user?: { name?: string | null; email?: string | null; image?: string | null } | undefined;
  signOutAction: () => Promise<void>;
  folders: Folder[];
  foldersVm: FoldersVm;
  linkCounts: LinkCounts;
  groupOpen: Record<string, boolean>;
  toggleGroup: (label: string) => void;
  onToggle: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  openSearch: () => void;
}

const rowLinkCls = (active: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
    active
      ? "bg-accent text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );

function isFolderNavActive(currentFolder: string | null | "__other__", folderParam: string | null) {
  return currentFolder === folderParam;
}

function StaticNavGroupBlock({
  group,
  pathname,
  groupOpen,
  toggleGroup,
}: {
  group: NavGroup;
  pathname: string;
  groupOpen: Record<string, boolean>;
  toggleGroup: (label: string) => void;
}) {
  return (
    <CollapsibleNavGroup
      label={group.label}
      open={groupOpen[group.label] ?? true}
      onOpenChange={() => toggleGroup(group.label)}
    >
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <Link key={item.href} href={item.href} className={rowLinkCls(pathname === item.href)}>
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-left">{item.title}</span>
          </Link>
        ))}
      </div>
    </CollapsibleNavGroup>
  );
}

function SidebarHeader({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="px-3 h-14 flex items-center">
      <div className="flex w-full items-center justify-between px-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-24.png" alt="Zhe" width={24} height={24} className="shrink-0" />
          <span className="text-lg md:text-xl font-semibold text-foreground">ZHE.TO</span>
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 font-medium text-muted-foreground"
          >
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
  );
}

function SidebarSearchButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="px-3 pb-1">
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-lg bg-secondary px-3 py-1.5 cursor-pointer"
      >
        <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <span className="flex-1 text-left text-sm text-muted-foreground">搜索链接...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
    </div>
  );
}

function LinkManagementGroup({
  currentFolder,
  folders,
  foldersVm,
  linkCounts,
  groupOpen,
  toggleGroup,
}: {
  currentFolder: string | null | "__other__";
  folders: Folder[];
  foldersVm: FoldersVm;
  linkCounts: LinkCounts;
  groupOpen: Record<string, boolean>;
  toggleGroup: (label: string) => void;
}) {
  return (
    <CollapsibleNavGroup
      label="链接管理"
      open={groupOpen["链接管理"] ?? true}
      onOpenChange={() => toggleGroup("链接管理")}
      trailing={
        <button
          onClick={(e) => { e.stopPropagation(); foldersVm.setIsCreating(true); }}
          aria-label="新建文件夹"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      }
    >
      <div className="flex flex-col gap-0.5">
        {FOLDER_NAV_ITEMS.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className={rowLinkCls(isFolderNavActive(currentFolder, item.folderParam))}
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

        {folders.map((folder) => (
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

        {foldersVm.isCreating && (
          <SidebarFolderCreate
            onCreate={foldersVm.handleCreateFolder}
            onCancel={() => foldersVm.setIsCreating(false)}
          />
        )}
      </div>
    </CollapsibleNavGroup>
  );
}

function SidebarUserFooter({
  user,
  signOutAction,
}: {
  user?: { name?: string | null; email?: string | null; image?: string | null } | undefined;
  signOutAction: () => Promise<void>;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
          <AvatarFallback className="text-xs">{user?.name?.[0] || "U"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </form>
          </TooltipTrigger>
          <TooltipContent side="top">Sign out</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function SidebarExpanded({
  pathname,
  currentFolder,
  user,
  signOutAction,
  folders,
  foldersVm,
  linkCounts,
  groupOpen,
  toggleGroup,
  onToggle,
  searchOpen,
  setSearchOpen,
  openSearch,
}: SidebarExpandedProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden">
      <SidebarHeader onToggle={onToggle} />
      <SidebarSearchButton onClick={openSearch} />
      <SearchCommandDialog open={searchOpen} onOpenChange={setSearchOpen} />

      <nav className="flex-1 overflow-y-auto pt-2">
        {PRE_LINK_NAV_GROUPS.map((group) => (
          <StaticNavGroupBlock
            key={group.label}
            group={group}
            pathname={pathname}
            groupOpen={groupOpen}
            toggleGroup={toggleGroup}
          />
        ))}

        <LinkManagementGroup
          currentFolder={currentFolder}
          folders={folders}
          foldersVm={foldersVm}
          linkCounts={linkCounts}
          groupOpen={groupOpen}
          toggleGroup={toggleGroup}
        />

        {OTHER_NAV_GROUPS.map((group) => (
          <StaticNavGroupBlock
            key={group.label}
            group={group}
            pathname={pathname}
            groupOpen={groupOpen}
            toggleGroup={toggleGroup}
          />
        ))}
      </nav>

      <SidebarUserFooter user={user} signOutAction={signOutAction} />
    </aside>
  );
}
