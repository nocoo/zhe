"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FolderIcon } from "@/components/folder-icon";
import { FOLDER_ICONS, DEFAULT_FOLDER_ICON } from "@/models/folders";

export interface SidebarFolderCreateProps {
  onCreate: (name: string, icon: string) => void;
  onCancel: () => void;
}

export function SidebarFolderCreate({
  onCreate,
  onCancel,
}: SidebarFolderCreateProps) {
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
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2">
      {/* Name input row */}
      <div className="flex items-center gap-1.5">
        <FolderIcon
          name={icon}
          className="h-4 w-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
            key={iconName}
            data-icon-name={iconName}
            data-testid={`icon-${iconName}`}
            onClick={() => setIcon(iconName)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              icon === iconName
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
