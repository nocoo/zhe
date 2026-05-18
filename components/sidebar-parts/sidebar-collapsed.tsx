"use client";

import { PanelLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FolderIcon } from "@/components/folder-icon";
import { SearchCommandDialog } from "@/components/search-command-dialog";
import { PRE_LINK_NAV_GROUPS, OTHER_NAV_GROUPS, FOLDER_NAV_ITEMS } from "./nav-config";
import type { Folder } from "@/models/types";

interface SidebarCollapsedProps {
  pathname: string;
  currentFolder: string | null | "__other__";
  user?: { name?: string | null; image?: string | null } | undefined;
  folders: Folder[];
  onToggle: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

function isFolderNavActive(currentFolder: string | null | "__other__", folderParam: string | null) {
  return currentFolder === folderParam;
}

const iconLinkCls = (active: boolean) =>
  cn(
    "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
    active
      ? "bg-accent text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );

export function SidebarCollapsed({
  pathname,
  currentFolder,
  user,
  folders,
  onToggle,
  searchOpen,
  setSearchOpen,
}: SidebarCollapsedProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-[68px] shrink-0 flex-col items-center bg-background transition-all duration-300 ease-in-out overflow-hidden">
      <div className="flex h-14 w-full items-center justify-start pl-6 pr-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-24.png" alt="Zhe" width={24} height={24} className="shrink-0" />
      </div>

      <button
        onClick={onToggle}
        aria-label="Expand sidebar"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
      >
        <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
      </button>

      <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
        {PRE_LINK_NAV_GROUPS.flatMap((g) => g.items).map((item) => (
          <Tooltip key={item.href} delayDuration={0}>
            <TooltipTrigger asChild>
              <Link href={item.href} className={iconLinkCls(pathname === item.href)}>
                <item.icon className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>{item.title}</TooltipContent>
          </Tooltip>
        ))}

        {FOLDER_NAV_ITEMS.map((item) => (
          <Tooltip key={item.title} delayDuration={0}>
            <TooltipTrigger asChild>
              <Link
                href={item.href}
                className={iconLinkCls(isFolderNavActive(currentFolder, item.folderParam))}
              >
                <item.icon className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>{item.title}</TooltipContent>
          </Tooltip>
        ))}

        {folders.map((folder) => (
          <Tooltip key={folder.id} delayDuration={0}>
            <TooltipTrigger asChild>
              <Link
                href={`/dashboard?folder=${folder.id}`}
                className={iconLinkCls(currentFolder === folder.id)}
              >
                <FolderIcon name={folder.icon} className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>{folder.name}</TooltipContent>
          </Tooltip>
        ))}

        {OTHER_NAV_GROUPS.flatMap((g) => g.items).map((item) => (
          <Tooltip key={item.href} delayDuration={0}>
            <TooltipTrigger asChild>
              <Link href={item.href} className={iconLinkCls(pathname === item.href)}>
                <item.icon className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>{item.title}</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="py-3 flex justify-center w-full">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Avatar className="h-9 w-9 cursor-pointer">
              {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
              <AvatarFallback className="text-xs">{user?.name?.[0] || "U"}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>{user?.name || "User"}</TooltipContent>
        </Tooltip>
      </div>
      <SearchCommandDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </aside>
  );
}
