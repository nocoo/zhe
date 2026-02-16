"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { FolderIcon } from "@/components/folder-icon";
import { FOLDER_ICONS } from "@/models/folders";
import type { Folder } from "@/models/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SidebarFolderItemProps {
  folder: Folder;
  linkCount: number;
  isSelected: boolean;
  isEditing: boolean;
  onStartEditing: (folderId: string) => void;
  onUpdate: (id: string, data: { name?: string; icon?: string }) => void;
  onDelete: (id: string) => void;
  onCancelEditing: () => void;
}

export function SidebarFolderItem({
  folder,
  linkCount,
  isSelected,
  isEditing,
  onStartEditing,
  onUpdate,
  onDelete,
  onCancelEditing,
}: SidebarFolderItemProps) {
  const [editName, setEditName] = useState(folder.name);
  const [editIcon, setEditIcon] = useState(folder.icon);

  function handleConfirm() {
    const trimmed = editName.trim();
    if (!trimmed) return;
    onUpdate(folder.id, { name: trimmed, icon: editIcon });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      onCancelEditing();
    }
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2">
        {/* Name input row */}
        <div className="flex items-center gap-1.5">
          <FolderIcon
            name={editIcon}
            className="h-4 w-4 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="文件夹名称"
            autoFocus
          />
          <button
            onClick={handleConfirm}
            aria-label="确认"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={onCancelEditing}
            aria-label="取消"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Icon picker grid */}
        <div className="grid grid-cols-8 gap-0.5">
          {FOLDER_ICONS.map((iconName) => (
            <button
              key={iconName}
              data-icon-name={iconName}
              data-testid={`icon-${iconName}`}
              onClick={() => setEditIcon(iconName)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded transition-colors",
                editIcon === iconName
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <FolderIcon name={iconName} className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <Link
        href={`/dashboard?folder=${folder.id}`}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
          isSelected
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <FolderIcon
          name={folder.icon}
          className="h-4 w-4 shrink-0"
          strokeWidth={1.5}
        />
        <span className="flex-1 text-left">{folder.name}</span>
        <span className="text-xs text-muted-foreground tabular-nums group-hover:hidden">{linkCount}</span>
      </Link>

      {/* Context menu trigger — replaces link count on hover */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="文件夹操作"
            className="absolute right-3 top-1/2 -translate-y-1/2 hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors group-hover:flex"
          >
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-32">
          <DropdownMenuItem onClick={() => onStartEditing(folder.id)}>
            <Pencil className="mr-2 h-3.5 w-3.5" strokeWidth={1.5} />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete(folder.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" strokeWidth={1.5} />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
