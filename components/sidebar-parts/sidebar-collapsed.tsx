"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@nocoo/basalt/components/avatar";
import {
  SidebarFooter,
  SidebarIconItem,
  SidebarNav,
  SidebarSearch,
  SidebarUser,
} from "@nocoo/basalt/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nocoo/basalt/components/tooltip";
import { Plus } from "@nocoo/basalt/icons";
import { FolderIcon } from "@/components/folder-icon";
import type { buildLinkCounts } from "@/models/links";
import type { Folder } from "@/models/types";
import {
  FOLDER_NAV_ITEMS,
  isStaticNavActive,
  OTHER_NAV_GROUPS,
  PRE_LINK_NAV_GROUPS,
} from "./nav-config";

interface SidebarCollapsedProps {
  pathname: string;
  currentFolder: string | null | "__other__";
  user?: { name?: string | null; image?: string | null } | undefined;
  folders: Folder[];
  linkCounts: ReturnType<typeof buildLinkCounts>;
  openSearch: () => void;
  onCreateFolder: () => void;
}

function isFolderNavActive(currentFolder: string | null | "__other__", folderParam: string | null) {
  return currentFolder === folderParam;
}

function CollapsedAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarIconItem onClick={onClick} aria-label={label}>
          {children}
          <span className="sr-only">{label}</span>
        </SidebarIconItem>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function CollapsedRow({
  href,
  active,
  label,
  ariaLabel = label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarIconItem href={href} active={active} aria-label={ariaLabel}>
          {children}
          <span className="sr-only">{ariaLabel}</span>
        </SidebarIconItem>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarCollapsed({
  pathname,
  currentFolder,
  user,
  folders,
  linkCounts,
  openSearch,
  onCreateFolder,
}: SidebarCollapsedProps) {
  return (
    <>
      <SidebarNav>
        <SidebarSearch shortcut="⌘K" onClick={openSearch} aria-label="打开搜索">
          打开搜索
        </SidebarSearch>

        {PRE_LINK_NAV_GROUPS.flatMap((group) => group.items).map((item) => (
          <CollapsedRow
            key={item.href}
            href={item.href}
            active={isStaticNavActive(pathname, item.href)}
            label={item.badge ? `${item.title} · ${item.badge}` : item.title}
            ariaLabel={item.title}
          >
            <item.icon className="size-4" strokeWidth={1.5} aria-hidden />
          </CollapsedRow>
        ))}

        {FOLDER_NAV_ITEMS.map((item) => (
          <CollapsedRow
            key={item.title}
            href={item.href}
            active={isFolderNavActive(currentFolder, item.folderParam)}
            label={`${item.title} · ${
              item.folderParam === null ? linkCounts.total : linkCounts.uncategorized
            }`}
            ariaLabel={item.title}
          >
            <item.icon className="size-4" strokeWidth={1.5} aria-hidden />
          </CollapsedRow>
        ))}

        <CollapsedAction label="新建文件夹" onClick={onCreateFolder}>
          <Plus className="size-4" strokeWidth={1.5} aria-hidden />
        </CollapsedAction>

        {folders.map((folder) => (
          <CollapsedRow
            key={folder.id}
            href={`/dashboard?folder=${folder.id}`}
            active={currentFolder === folder.id}
            label={`${folder.name} · ${linkCounts.byFolder.get(folder.id) ?? 0}`}
            ariaLabel={folder.name}
          >
            <FolderIcon name={folder.icon} className="size-4" strokeWidth={1.5} aria-hidden />
          </CollapsedRow>
        ))}

        {OTHER_NAV_GROUPS.flatMap((group) => group.items).map((item) => (
          <CollapsedRow
            key={item.href}
            href={item.href}
            active={isStaticNavActive(pathname, item.href)}
            label={item.title}
          >
            <item.icon className="size-4" strokeWidth={1.5} aria-hidden />
          </CollapsedRow>
        ))}
      </SidebarNav>

      <SidebarFooter>
        <SidebarUser
          name={user?.name ?? "User"}
          email={undefined}
          avatar={
            <Avatar className="h-9 w-9">
              {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
              <AvatarFallback className="text-basalt-sm">{user?.name?.[0] || "U"}</AvatarFallback>
            </Avatar>
          }
        />
      </SidebarFooter>
    </>
  );
}
