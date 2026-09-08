"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { FolderIcon } from "@/components/folder-icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_FOLDER_ICON, FOLDER_ICONS } from "@/models/folders";

export interface SidebarFolderCreateProps {
  onCreate: (name: string, icon: string) => void;
  onCancel: () => void;
}

export function SidebarFolderCreate({ onCreate, onCancel }: SidebarFolderCreateProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_FOLDER_ICON);

  function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, icon);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-widget bg-card p-2">
      {/* Name input row */}
      <div className="flex items-center gap-1.5">
        <FolderIcon
          name={icon}
          className="h-4 w-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          size="sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 border-transparent bg-transparent shadow-none focus-visible:ring-0"
          placeholder="文件夹名称"
          autoFocus
        />
        <button
          type="button"
          onClick={handleConfirm}
          aria-label="确认"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onCancel}
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
            type="button"
            key={iconName}
            data-icon-name={iconName}
            data-testid={`icon-${iconName}`}
            onClick={() => setIcon(iconName)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              icon === iconName
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <FolderIcon name={iconName} className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </div>
  );
}
