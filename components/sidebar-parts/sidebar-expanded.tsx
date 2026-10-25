"use client";

import {
  SidebarFooter,
  SidebarHeader,
  SidebarNav,
  SidebarSearch,
  SidebarUser,
} from "@nocoo/basalt/components/sidebar";
import { LogOut, PanelLeft, Plus } from "lucide-react";
import Link from "next/link";
import { SidebarFolderCreate } from "@/components/sidebar-folder-create";
import { SidebarFolderItem } from "@/components/sidebar-folder-item";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APP_VERSION } from "@/lib/version";
import type { buildLinkCounts } from "@/models/links";
import type { Folder } from "@/models/types";
import type { useFoldersViewModel } from "@/viewmodels/useFoldersViewModel";
import { CollapsibleNavGroup } from "./collapsible-nav-group";
import {
  FOLDER_NAV_ITEMS,
  isStaticNavActive,
  type NavGroup,
  OTHER_NAV_GROUPS,
  PRE_LINK_NAV_GROUPS,
} from "./nav-config";
import { NavRowCount, NavRowLink } from "./nav-row";

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
  openSearch: () => void;
  isMobile: boolean;
}

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
      {group.items.map((item) => (
        <NavRowLink
          key={item.href}
          href={item.href}
          active={isStaticNavActive(pathname, item.href)}
        >
          <item.icon className="size-4" strokeWidth={1.5} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{item.title}</span>
          {item.badge && (
            <Badge
              variant="secondary"
              className="shrink-0 px-basalt-space-md py-basalt-space-xs text-basalt-sm font-medium leading-basalt-tight text-basalt-muted-foreground"
            >
              {item.badge}
            </Badge>
          )}
        </NavRowLink>
      ))}
    </CollapsibleNavGroup>
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
      open={groupOpen.链接管理 ?? true}
      onOpenChange={() => toggleGroup("链接管理")}
      trailing={
        <Button
          variant="ghost"
          size="icon"
          aria-label="新建文件夹"
          onClick={(event) => {
            event.stopPropagation();
            foldersVm.setIsCreating(true);
          }}
          className="mr-basalt-row-x size-5 shrink-0 [&_svg]:size-3.5"
        >
          <Plus aria-hidden />
        </Button>
      }
    >
      {FOLDER_NAV_ITEMS.map((item) => (
        <NavRowLink
          key={item.title}
          href={item.href}
          active={isFolderNavActive(currentFolder, item.folderParam)}
        >
          <item.icon className="size-4" strokeWidth={1.5} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{item.title}</span>
          <NavRowCount>
            {item.folderParam === null ? linkCounts.total : linkCounts.uncategorized}
          </NavRowCount>
        </NavRowLink>
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
    </CollapsibleNavGroup>
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
  openSearch,
  isMobile,
}: SidebarExpandedProps) {
  return (
    <>
      <SidebarHeader>
        <div className="flex w-full items-center justify-between pl-basalt-layout-sm">
          <Link
            href="/dashboard/overview"
            aria-label="Zhe"
            className="flex min-w-0 items-center gap-basalt-space-lg text-basalt-foreground no-underline hover:no-underline"
          >
            <img
              src="/logo-24.png"
              alt=""
              width={28}
              height={28}
              data-testid="sidebar-logo"
              className="size-7 shrink-0"
            />
            <span className="truncate text-basalt-xl font-semibold text-basalt-foreground">
              ZHE.TO
            </span>
            <span className="shrink-0 rounded-basalt-md bg-basalt-secondary px-basalt-space-md py-basalt-space-xs text-basalt-sm font-medium leading-basalt-tight text-basalt-muted-foreground">
              v{APP_VERSION}
            </span>
          </Link>
          {isMobile ? null : (
            <Button
              variant="ghost"
              size="icon"
              className="w-7 shrink-0"
              onClick={onToggle}
              aria-label="Collapse sidebar"
            >
              <PanelLeft aria-hidden />
            </Button>
          )}
        </div>
      </SidebarHeader>

      <div className="px-basalt-nav-inset">
        <SidebarSearch onClick={openSearch}>搜索收藏与记录…</SidebarSearch>
      </div>

      <SidebarNav>
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
      </SidebarNav>

      <SidebarFooter>
        <SidebarUser
          name={user?.name ?? "User"}
          email={user?.email ?? ""}
          avatar={
            <Avatar className="size-9 shrink-0">
              {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
              <AvatarFallback className="text-basalt-sm">{user?.name?.[0] || "U"}</AvatarFallback>
            </Avatar>
          }
          action={
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                className="w-8 shrink-0"
              >
                <LogOut aria-hidden />
              </Button>
            </form>
          }
        />
      </SidebarFooter>
    </>
  );
}
