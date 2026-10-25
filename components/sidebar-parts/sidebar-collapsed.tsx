"use client";

import { SidebarFooter, SidebarHeader, SidebarNav } from "@nocoo/basalt/components/sidebar";
import { PanelLeft, Search } from "lucide-react";
import Link from "next/link";
import { FolderIcon } from "@/components/folder-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Folder } from "@/models/types";
import {
  FOLDER_NAV_ITEMS,
  isStaticNavActive,
  OTHER_NAV_GROUPS,
  PRE_LINK_NAV_GROUPS,
} from "./nav-config";
import { NAV_ROW_CLASS } from "./nav-row";

interface SidebarCollapsedProps {
  pathname: string;
  currentFolder: string | null | "__other__";
  user?: { name?: string | null; image?: string | null } | undefined;
  folders: Folder[];
  onToggle: () => void;
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
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          data-basalt-hover-item=""
          data-hover-selected={active ? "true" : undefined}
          className={cn(
            NAV_ROW_CLASS,
            "w-[var(--basalt-size-control)] shrink-0 justify-center px-0",
          )}
        >
          {children}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarCollapsed({
  pathname,
  currentFolder,
  user,
  folders,
  onToggle,
  openSearch,
}: SidebarCollapsedProps) {
  return (
    <TooltipProvider>
      <SidebarHeader>
        <img
          src="/logo-24.png"
          alt="Zhe"
          width={28}
          height={28}
          data-testid="sidebar-logo"
          className="size-7 shrink-0"
        />
      </SidebarHeader>

      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        aria-label="Expand sidebar"
        className="mb-basalt-space-sm self-center"
      >
        <PanelLeft aria-hidden />
      </Button>

      <SidebarNav>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={openSearch}
              aria-label="打开搜索"
              className={cn(
                NAV_ROW_CLASS,
                "w-[var(--basalt-size-control)] shrink-0 justify-center px-0",
              )}
            >
              <Search className="size-4" strokeWidth={1.5} aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            打开搜索
          </TooltipContent>
        </Tooltip>

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
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Avatar className="size-9 cursor-pointer">
              {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
              <AvatarFallback className="text-basalt-sm">{user?.name?.[0] || "U"}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {user?.name || "User"}
          </TooltipContent>
        </Tooltip>
      </SidebarFooter>
    </TooltipProvider>
  );
}
