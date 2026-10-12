"use client";

import { FolderOpen } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { BookmarkAction } from "@/models/bookmark-actions";
import { getTagStyles } from "@/models/tags";
import type { Link, Tag } from "@/models/types";
import { BookmarkActions } from "./bookmark-actions";

function CardTag({ tag }: { tag: Tag }) {
  return (
    <span
      className="inline-flex min-w-0 max-w-24 items-center rounded-full px-2 py-0.5 text-xs"
      style={getTagStyles(tag.name, tag.color).badge}
      title={tag.name}
    >
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

export function BookmarkCardFooter({
  link,
  folder,
  tags,
  actions,
  triggerRef,
  compact = false,
}: {
  link: Link;
  folder: string;
  tags: Tag[];
  actions: BookmarkAction[];
  triggerRef: Ref<HTMLButtonElement>;
  compact?: boolean;
}) {
  const date = new Date(link.createdAt);
  const label = new Intl.DateTimeFormat("sv-SE").format(date);
  return (
    <div
      className={cn(
        "mt-auto shrink-0",
        compact && "sm:flex sm:items-center sm:border-t sm:border-border/60",
      )}
      data-bookmark-footer
    >
      <div
        className="flex h-10 min-w-0 flex-1 items-center gap-2 px-3"
        data-bookmark-classification
      >
        <span
          className="mr-auto inline-flex min-w-0 max-w-[45%] items-center gap-1.5 text-xs text-muted-foreground"
          title={folder}
        >
          <FolderOpen className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="truncate">{folder}</span>
        </span>
        {tags[0] && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="min-w-0 gap-1 px-0 text-xs"
                aria-label="查看全部标签"
              >
                <CardTag tag={tags[0]} />
                {tags.length > 1 && <span className="shrink-0">+{tags.length - 1}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 max-w-[calc(100vw-2rem)]">
              <p className="mb-2 text-sm font-medium">收藏标签</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="max-w-full break-words text-sm"
                    style={{ color: getTagStyles(tag.name, tag.color).badge.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div
        className={cn(
          "flex min-h-11 shrink-0 items-center justify-between gap-2 border-t border-border/60 px-3 py-1",
          compact && "sm:border-t-0",
        )}
        data-bookmark-action-row
      >
        <time
          dateTime={date.toISOString()}
          title={`收藏于 ${date.toLocaleString("zh-CN")}`}
          className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
        >
          <span>{label}</span>
        </time>
        <BookmarkActions actions={actions} triggerRef={triggerRef} />
      </div>
    </div>
  );
}
