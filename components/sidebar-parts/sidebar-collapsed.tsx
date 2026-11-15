"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@nocoo/basalt/components/avatar";
import {
  SidebarFooter,
  SidebarIconItem,
  SidebarNav,
  SidebarSearch,
  SidebarUser,
} from "@nocoo/basalt/components/sidebar";
import { FolderIcon } from "@/components/folder-icon";
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
  openSearch: () => void;
}

function isFolderNavActive(currentFolder: string | null | "__other__", folderParam: string | null) {
  return currentFolder === folderParam;
}

function CollapsedRow({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <SidebarIconItem href={href} active={active} aria-label={label}>
      {children}
    </SidebarIconItem>
  );
}

export function SidebarCollapsed({
  pathname,
  currentFolder,
  user,
  folders,
  openSearch,
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
            label={item.title}
          >
            <item.icon className="size-4" strokeWidth={1.5} aria-hidden />
          </CollapsedRow>
        ))}

        {FOLDER_NAV_ITEMS.map((item) => (
          <CollapsedRow
            key={item.title}
            href={item.href}
            active={isFolderNavActive(currentFolder, item.folderParam)}
            label={item.title}
          >
            <item.icon className="size-4" strokeWidth={1.5} aria-hidden />
          </CollapsedRow>
        ))}

        {folders.map((folder) => (
          <CollapsedRow
            key={folder.id}
            href={`/dashboard?folder=${folder.id}`}
            active={currentFolder === folder.id}
            label={folder.name}
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
