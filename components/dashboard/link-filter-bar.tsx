"use client";

import { useState } from "react";
import { Check, ChevronDown, FolderOpen, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command";
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
}: LinkFilterBarProps) {
  const hasActiveFilters = filterFolderId !== null || filterTagIds.size > 0;
  const selectedFolder = filterFolderId
    ? filterFolderId === "uncategorized"
      ? { name: "Inbox" }
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
      <TagFilter
        tags={tags}
        selectedTagIds={filterTagIds}
        onToggle={onToggleTag}
      />

      {/* Active tag badges */}
      {selectedTags.map((tag) => {
        const styles = getTagStyles(tag.name);
        return (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={styles.badge}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={styles.dot} />
            {tag.name}
            <button
              type="button"
              onClick={() => onToggleTag(tag.id)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              aria-label={`Remove filter ${tag.name}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          清除筛选
        </button>
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

function FolderFilter({ folders, selectedFolderId, selectedFolderName, onSelect }: FolderFilterProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (folderId: string | null) => {
    onSelect(folderId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
            selectedFolderId
              ? "border-primary/30 bg-primary/5 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
          )}
        >
          <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>{selectedFolderName ?? "文件夹"}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList>
            <CommandGroup>
              <CommandItem
                onSelect={() => handleSelect(null)}
                className="flex items-center gap-2"
              >
                <Check className={cn("h-3.5 w-3.5", selectedFolderId === null ? "opacity-100" : "opacity-0")} />
                <span>全部文件夹</span>
              </CommandItem>
              <CommandItem
                onSelect={() => handleSelect("uncategorized")}
                className="flex items-center gap-2"
              >
                <Check className={cn("h-3.5 w-3.5", selectedFolderId === "uncategorized" ? "opacity-100" : "opacity-0")} />
                <span>Inbox</span>
              </CommandItem>
              {folders.map((folder) => (
                <CommandItem
                  key={folder.id}
                  onSelect={() => handleSelect(folder.id)}
                  className="flex items-center gap-2"
                >
                  <Check className={cn("h-3.5 w-3.5", selectedFolderId === folder.id ? "opacity-100" : "opacity-0")} />
                  <span>{folder.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
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

function TagFilter({ tags, selectedTagIds, onToggle }: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
            selectedTagIds.size > 0
              ? "border-primary/30 bg-primary/5 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
          )}
        >
          <Tag className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>
            {selectedTagIds.size > 0
              ? `标签 (${selectedTagIds.size})`
              : "标签"}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="搜索标签..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              未找到标签
            </CommandEmpty>
            <CommandGroup>
              {filteredTags.map((tag) => {
                const styles = getTagStyles(tag.name);
                const isSelected = selectedTagIds.has(tag.id);
                return (
                  <CommandItem
                    key={tag.id}
                    value={tag.id}
                    onSelect={() => onToggle(tag.id)}
                    className="flex items-center gap-2"
                  >
                    <Check className={cn("h-3.5 w-3.5", isSelected ? "opacity-100" : "opacity-0")} />
                    <span className="h-2 w-2 rounded-full" style={styles.dot} />
                    <span>{tag.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
