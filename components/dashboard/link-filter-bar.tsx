"use client";

import { Button } from "@nocoo/basalt/components/button";
import { Input } from "@nocoo/basalt/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@nocoo/basalt/components/popover";
import { Check, ChevronDown, FolderOpen, Tag, X } from "@nocoo/basalt/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getTagStyles } from "@/models/tags";
import type { Folder, Tag as TagType } from "@/models/types";

interface LinkFilterBarProps {
  folders: Folder[];
  tags: TagType[];
  filterFolderId: string | null;
  filterTagIds: Set<string>;
  onFolderChange: (folderId: string | null) => void;
  onToggleTag: (tagId: string) => void;
  onClear: () => void;
  /** Hide folder filter when sidebar already selected a folder */
  showFolderFilter: boolean;
  hasAdditionalFilters?: boolean;
}

export function LinkFilterBar({
  folders,
  tags,
  filterFolderId,
  filterTagIds,
  onFolderChange,
  onToggleTag,
  onClear,
  showFolderFilter,
  hasAdditionalFilters = false,
}: LinkFilterBarProps) {
  const hasActiveFilters = filterFolderId !== null || filterTagIds.size > 0 || hasAdditionalFilters;
  const selectedFolder = filterFolderId
    ? filterFolderId === "uncategorized"
      ? { name: "未分类" }
      : folders.find((f) => f.id === filterFolderId)
    : null;

  const selectedTags = tags.filter((t) => filterTagIds.has(t.id));

  return (
    <>
      {/* Folder filter */}
      {showFolderFilter && (
        <FolderFilter
          folders={folders}
          selectedFolderId={filterFolderId}
          selectedFolderName={selectedFolder?.name ?? null}
          onSelect={onFolderChange}
        />
      )}

      {/* Tag filter */}
      <TagFilter tags={tags} selectedTagIds={filterTagIds} onToggle={onToggleTag} />

      {/* Active tag badges */}
      {selectedTags.map((tag) => {
        const styles = getTagStyles(tag.name, tag.color);
        return (
          <span
            key={tag.id}
            className="inline-flex h-7 items-center gap-basalt-space-sm rounded-full px-basalt-space-lg text-basalt-xs font-medium"
            style={styles.badge}
            data-testid="active-tag-filter"
            data-tag-name={tag.name}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={styles.dot} />
            {tag.name}
            <button
              type="button"
              onClick={() => onToggleTag(tag.id)}
              className="ml-basalt-space-xs rounded-full p-basalt-space-xs transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              aria-label={`Remove filter ${tag.name}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}

      {/* Clear all */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} data-testid="clear-filters">
          清除筛选
        </Button>
      )}
    </>
  );
}

// ── Folder Filter Popover ──

interface FolderFilterProps {
  folders: Folder[];
  selectedFolderId: string | null;
  selectedFolderName: string | null;
  onSelect: (folderId: string | null) => void;
}

function FolderFilter({
  folders,
  selectedFolderId,
  selectedFolderName,
  onSelect,
}: FolderFilterProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (folderId: string | null) => {
    onSelect(folderId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-basalt-space-md",
            selectedFolderId
              ? "border-basalt-primary/30 bg-basalt-primary/5 text-basalt-foreground"
              : "border-basalt-border text-basalt-muted-foreground hover:text-basalt-foreground hover:border-basalt-foreground/30",
          )}
        >
          <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>{selectedFolderName ?? "文件夹"}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-basalt-space-sm" align="start">
        <div className="flex flex-col gap-basalt-space-xs" role="listbox" aria-label="文件夹">
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-basalt-space-lg"
            role="option"
            aria-selected={selectedFolderId === null}
            onClick={() => handleSelect(null)}
          >
            <Check
              className={cn("size-3.5", selectedFolderId === null ? "opacity-100" : "opacity-0")}
            />
            <span>全部文件夹</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-basalt-space-lg"
            role="option"
            aria-selected={selectedFolderId === "uncategorized"}
            onClick={() => handleSelect("uncategorized")}
          >
            <Check
              className={cn(
                "size-3.5",
                selectedFolderId === "uncategorized" ? "opacity-100" : "opacity-0",
              )}
            />
            <span>未分类</span>
          </Button>
          {folders.map((folder) => (
            <Button
              key={folder.id}
              variant="ghost"
              size="sm"
              className="justify-start gap-basalt-space-lg"
              role="option"
              aria-selected={selectedFolderId === folder.id}
              onClick={() => handleSelect(folder.id)}
            >
              <Check
                className={cn(
                  "size-3.5",
                  selectedFolderId === folder.id ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="truncate">{folder.name}</span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Tag Filter Popover (multi-select) ──

interface TagFilterProps {
  tags: TagType[];
  selectedTagIds: Set<string>;
  onToggle: (tagId: string) => void;
}

export function TagFilter({ tags, selectedTagIds, onToggle }: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredTags = tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-basalt-space-md",
            selectedTagIds.size > 0
              ? "border-basalt-primary/30 bg-basalt-primary/5 text-basalt-foreground"
              : "border-basalt-border text-basalt-muted-foreground hover:text-basalt-foreground hover:border-basalt-foreground/30",
          )}
          data-testid="tag-filter-trigger"
        >
          <Tag className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>{selectedTagIds.size > 0 ? `标签 (${selectedTagIds.size})` : "标签"}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-basalt-space-lg" align="start">
        <Input
          placeholder="搜索标签..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div
          className="mt-basalt-space-sm flex max-h-64 flex-col overflow-y-auto"
          role="listbox"
          aria-label="标签"
        >
          {filteredTags.length === 0 ? (
            <p className="py-basalt-space-card-sm text-center text-basalt-sm text-basalt-muted-foreground">
              未找到标签
            </p>
          ) : (
            filteredTags.map((tag) => {
              const styles = getTagStyles(tag.name, tag.color);
              const isSelected = selectedTagIds.has(tag.id);
              return (
                <Button
                  key={tag.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start gap-basalt-space-lg"
                  onClick={() => onToggle(tag.id)}
                  role="option"
                  aria-selected={isSelected}
                  data-testid="tag-filter-item"
                  data-tag-name={tag.name}
                >
                  <Check className={cn("size-3.5", isSelected ? "opacity-100" : "opacity-0")} />
                  <span className="size-2 rounded-full" style={styles.dot} />
                  <span className="truncate">{tag.name}</span>
                </Button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
