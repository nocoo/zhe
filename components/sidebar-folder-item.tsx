"use client";

import { Check, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { FolderIcon } from "@/components/folder-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FOLDER_ICONS } from "@/models/folders";
import type { Folder } from "@/models/types";
import { NavRowCount, NavRowLink } from "./sidebar-parts/nav-row";

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

interface FolderItemEditorProps {
  initialName: string;
  initialIcon: string;
  onSave: (next: { name: string; icon: string }) => void;
  onCancel: () => void;
}

function FolderItemEditor({ initialName, initialIcon, onSave, onCancel }: FolderItemEditorProps) {
  const [editName, setEditName] = useState(initialName);
  const [editIcon, setEditIcon] = useState(initialIcon);

  function handleConfirm() {
    const trimmed = editName.trim();
    if (!trimmed) return;
    onSave({ name: trimmed, icon: editIcon });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleConfirm();
    else if (e.key === "Escape") onCancel();
  }

  return (
    <div className="flex flex-col gap-basalt-space-lg rounded-basalt-md bg-basalt-secondary p-basalt-space-lg">
      <div className="flex items-center gap-basalt-space-sm">
        <FolderIcon
          name={editIcon}
          className="size-4 shrink-0 text-basalt-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          size="sm"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 border-transparent bg-transparent shadow-none focus-visible:ring-0"
          placeholder="文件夹名称"
          autoFocus
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleConfirm}
          aria-label="确认"
          className="size-6 shrink-0 [&_svg]:size-3.5"
        >
          <Check aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label="取消"
          className="size-6 shrink-0 [&_svg]:size-3.5"
        >
          <X aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-8 gap-basalt-space-xs">
        {FOLDER_ICONS.map((iconName) => (
          <button
            type="button"
            key={iconName}
            data-icon-name={iconName}
            data-testid={`icon-${iconName}`}
            onClick={() => setEditIcon(iconName)}
            className={cn(
              "flex size-7 items-center justify-center rounded-basalt-sm transition-colors",
              editIcon === iconName
                ? "bg-basalt-selected text-basalt-foreground"
                : "text-basalt-muted-foreground hover:bg-basalt-hover hover:text-basalt-foreground",
            )}
          >
            <FolderIcon name={iconName} className="size-3.5" strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </div>
  );
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
  if (isEditing) {
    return (
      <FolderItemEditor
        initialName={folder.name}
        initialIcon={folder.icon}
        onSave={(next) => onUpdate(folder.id, next)}
        onCancel={onCancelEditing}
      />
    );
  }

  return (
    <div className="group relative">
      <NavRowLink href={`/dashboard?folder=${folder.id}`} active={isSelected}>
        <FolderIcon name={folder.icon} className="size-4" strokeWidth={1.5} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
        <span className="group-hover:opacity-0">
          <NavRowCount>{linkCount}</NavRowCount>
        </span>
      </NavRowLink>

      {/* Dropdown outside the link so clicks never bubble into navigation */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="文件夹操作"
            className="basalt-focus absolute top-1/2 right-basalt-space-lg flex size-6 -translate-y-1/2 items-center justify-center rounded-basalt-sm text-basalt-muted-foreground opacity-0 pointer-events-none transition-colors group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-basalt-hover hover:text-basalt-foreground"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-32">
          <DropdownMenuItem onClick={() => onStartEditing(folder.id)}>
            <Pencil aria-hidden />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete(folder.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 aria-hidden />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
