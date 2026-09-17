"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { stripProtocol } from "@/models/links";
import type { Folder, Tag } from "@/models/types";
import { TagBadge, TagPicker } from "../shared-link-components";

interface ModeTabsProps {
  mode: "simple" | "custom";
  setMode: (mode: "simple" | "custom") => void;
}

export function ModeTabs({ mode, setMode }: ModeTabsProps) {
  return (
    <div className="flex gap-2">
      {(["simple", "custom"] as const).map((option) => (
        <Button
          key={option}
          variant="outline"
          aria-pressed={mode === option}
          className={cn("flex-1", mode === option && "border-primary/40 text-primary")}
          onClick={() => setMode(option)}
        >
          {option === "simple" ? "简单模式" : "自定义 slug"}
        </Button>
      ))}
    </div>
  );
}

export function SlugInput({
  siteUrl,
  customSlug,
  setCustomSlug,
  required,
}: {
  siteUrl: string;
  customSlug: string;
  setCustomSlug: (v: string) => void;
  required: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="slug" className="block text-xs font-medium leading-4">
        自定义 slug
      </Label>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {stripProtocol(siteUrl)}/
        </span>
        <Input
          id="slug"
          size="default"
          type="text"
          placeholder="my-custom-link"
          value={customSlug}
          onChange={(e) => setCustomSlug(e.target.value)}
          pattern="^[a-zA-Z0-9_-]+$"
          title="Only letters, numbers, hyphens, and underscores"
          required={required}
        />
      </div>
    </div>
  );
}

export function FolderSelect({
  folders,
  folderId,
  setFolderId,
}: {
  folders: Folder[];
  folderId: string | undefined;
  setFolderId: (v: string | undefined) => void;
}) {
  if (folders.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="folder" className="block text-xs font-medium leading-4">
        文件夹
      </Label>
      <Select
        value={folderId ?? "__inbox__"}
        onValueChange={(v) => setFolderId(v === "__inbox__" ? undefined : v)}
      >
        <SelectTrigger id="folder" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__inbox__">Inbox</SelectItem>
          {folders.map((folder) => (
            <SelectItem key={folder.id} value={folder.id}>
              {folder.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TagsField({
  tags,
  assignedTags,
  selectedTagIds,
  onAddTag,
  onRemoveTag,
  onCreateTag,
}: {
  tags: Tag[];
  assignedTags: Tag[];
  selectedTagIds: Set<string>;
  onAddTag: (id: string) => void;
  onRemoveTag: (id: string) => void;
  onCreateTag: (name: string) => Promise<void>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="block text-xs font-medium leading-4">标签</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        {assignedTags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} onRemove={onRemoveTag} />
        ))}
        <TagPicker
          allTags={tags}
          assignedTagIds={selectedTagIds}
          onSelectTag={onAddTag}
          onCreateTag={onCreateTag}
        />
      </div>
    </div>
  );
}
