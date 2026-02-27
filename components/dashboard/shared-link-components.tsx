"use client";

import { useState, useCallback } from "react";
import { Check, Copy, Plus, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { copyToClipboard } from "@/lib/utils";
import type { Tag } from "@/models/types";

// ── DeleteLinkDialog ──

interface DeleteLinkDialogProps {
  /** The trigger button element (e.g. a trash icon button) */
  trigger: React.ReactNode;
  isDeleting: boolean;
  onConfirm: () => void;
}

/** Shared confirmation dialog for deleting a link */
export function DeleteLinkDialog({ trigger, isDeleting, onConfirm }: DeleteLinkDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            此操作不可撤销，确定要删除这条链接吗？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "删除中..." : "删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── TagBadge ──

interface TagBadgeProps {
  tag: Tag;
  /** When provided, shows a remove (X) button */
  onRemove?: (tagId: string) => void;
  /** Size variant — "sm" for compact read-only badges, "md" (default) for editable badges */
  size?: "sm" | "md";
}

/** A single tag badge with optional remove button */
export function TagBadge({ tag, onRemove, size = "md" }: TagBadgeProps) {
  const styles = getTagStyles(tag.name);

  if (size === "sm") {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-medium"
        style={styles.badge}
      >
        <span className="h-1 w-1 rounded-full" style={styles.dot} />
        {tag.name}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={styles.badge}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={styles.dot} />
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(tag.id)}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

// ── TagPicker ──

interface TagPickerProps {
  allTags: Tag[];
  assignedTagIds: Set<string>;
  onSelectTag: (tagId: string) => void;
  onCreateTag: (name: string) => void;
  /** Label text for the trigger button */
  triggerLabel?: string;
  /** Popover content width */
  popoverWidth?: string;
}

/** Popover-based tag picker with search + create-new capability */
export function TagPicker({
  allTags,
  assignedTagIds,
  onSelectTag,
  onCreateTag,
  triggerLabel = "标签",
  popoverWidth = "w-56",
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const unassignedTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  const handleSelect = (tagId: string) => {
    onSelectTag(tagId);
    setSearch("");
    setOpen(false);
  };

  const handleCreate = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    onCreateTag(trimmed);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          aria-label="Add tag"
        >
          <Plus className="h-3 w-3" />
          {triggerLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent className={`${popoverWidth} p-0`} align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="搜索或创建标签..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              未找到标签
            </CommandEmpty>
            <CommandGroup>
              {unassignedTags
                .filter((t) =>
                  t.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((tag) => {
                  const styles = getTagStyles(tag.name);
                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.id}
                      onSelect={() => handleSelect(tag.id)}
                      className="flex items-center gap-2"
                    >
                      <span className="h-2 w-2 rounded-full" style={styles.dot} />
                      <span>{tag.name}</span>
                    </CommandItem>
                  );
                })}
            </CommandGroup>
            {search.trim() &&
              !allTags.some(
                (t) => t.name.toLowerCase() === search.trim().toLowerCase(),
              ) && (
                <CommandGroup>
                  <CommandItem
                    onSelect={handleCreate}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>创建 &ldquo;{search.trim()}&rdquo;</span>
                  </CommandItem>
                </CommandGroup>
              )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── CopyUrlButton ──

interface CopyUrlButtonProps {
  url: string;
  /** Additional CSS classes for the button */
  className?: string;
}

/** Button that copies a URL to clipboard with a check icon feedback */
export function CopyUrlButton({ url, className = "" }: CopyUrlButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [url]);

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy original URL"
      className={`shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors ${className}`}
      title="Copy original URL"
    >
      {copied ? (
        <Check className="w-3 h-3 text-success" strokeWidth={1.5} />
      ) : (
        <Copy className="w-3 h-3" strokeWidth={1.5} />
      )}
    </button>
  );
}
