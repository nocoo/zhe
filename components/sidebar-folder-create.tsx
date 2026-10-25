"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { FolderIcon } from "@/components/folder-icon";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-basalt-space-lg rounded-basalt-md bg-basalt-secondary p-basalt-space-lg">
      {/* Name input row */}
      <div className="flex items-center gap-basalt-space-sm">
        <FolderIcon
          name={icon}
          className="size-4 shrink-0 text-basalt-muted-foreground"
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

      {/* Icon picker grid */}
      <div className="grid grid-cols-8 gap-basalt-space-xs">
        {FOLDER_ICONS.map((iconName) => (
          <button
            type="button"
            key={iconName}
            data-icon-name={iconName}
            data-testid={`icon-${iconName}`}
            onClick={() => setIcon(iconName)}
            className={cn(
              "flex size-7 items-center justify-center rounded-basalt-sm transition-colors",
              icon === iconName
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
