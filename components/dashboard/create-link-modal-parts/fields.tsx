"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { stripProtocol } from "@/models/links";
import { TagBadge, TagPicker } from "../shared-link-components";
import type { Folder, Tag } from "@/models/types";

const INPUT_CLS =
  "rounded-widget border-border bg-secondary text-sm placeholder:text-muted-foreground focus-visible:ring-primary";

interface ModeTabsProps {
  mode: "simple" | "custom";
  setMode: (mode: "simple" | "custom") => void;
}

export function ModeTabs({ mode, setMode }: ModeTabsProps) {
  const tabCls = (active: boolean) =>
    `flex-1 py-2 text-sm rounded-widget transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-secondary-foreground hover:bg-accent"
    }`;
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => setMode("simple")} className={tabCls(mode === "simple")}>
        简单模式
      </button>
      <button type="button" onClick={() => setMode("custom")} className={tabCls(mode === "custom")}>
        自定义 slug
      </button>
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
    <div className="space-y-2">
      <Label htmlFor="slug" className="text-sm text-foreground">
        自定义 slug
      </Label>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {stripProtocol(siteUrl)}/
        </span>
        <Input
          id="slug"
          type="text"
          placeholder="my-custom-link"
          value={customSlug}
          onChange={(e) => setCustomSlug(e.target.value)}
          pattern="^[a-zA-Z0-9_-]+$"
          title="Only letters, numbers, hyphens, and underscores"
          required={required}
          className={INPUT_CLS}
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
    <div className="space-y-2">
      <Label htmlFor="folder" className="text-sm text-foreground">
        文件夹
      </Label>
      <Select
        value={folderId ?? "__inbox__"}
        onValueChange={(v) => setFolderId(v === "__inbox__" ? undefined : v)}
      >
        <SelectTrigger
          id="folder"
          className="h-9 w-full rounded-widget border-border bg-secondary text-sm focus:ring-1 focus:ring-primary"
        >
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
    <div className="space-y-2">
      <Label className="text-sm text-foreground">标签</Label>
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
