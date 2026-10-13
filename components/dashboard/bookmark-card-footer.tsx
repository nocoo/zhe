"use client";

import { toast } from "@nocoo/basalt/components/toast";
import { FolderOpen } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, copyToClipboard, formatRelativeTime } from "@/lib/utils";
import type { BookmarkAction } from "@/models/bookmark-actions";
import { getTagStyles } from "@/models/tags";
import type { Link, Tag } from "@/models/types";
import { BookmarkActions } from "./bookmark-actions";

export function BookmarkCardFooter({
  link,
  folder,
  tags,
  actions,
  triggerRef,
  compact = false,
  showClassification = true,
}: {
  link: Link;
  folder: string;
  tags: Tag[];
  actions: BookmarkAction[];
  triggerRef: Ref<HTMLButtonElement>;
  compact?: boolean;
  showClassification?: boolean;
}) {
  const date = new Date(link.createdAt);
  const timestamp = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "longOffset",
  }).format(date);
  return (
    <div
      className={cn(
        "mt-auto shrink-0",
        compact && "sm:flex sm:items-center sm:border-t sm:border-border/60",
      )}
      data-bookmark-footer
    >
      {showClassification && (
        <div
          className="flex h-10 min-w-0 flex-1 items-center gap-2 px-3"
          data-bookmark-classification
        >
          <span
            className="inline-flex min-w-0 max-w-[45%] shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
            title={folder}
          >
            <FolderOpen className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="truncate">{folder}</span>
          </span>
          {tags.length > 0 && (
            <ul
              aria-label="收藏标签"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll overflowing tags.
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                event.currentTarget.scrollLeft += event.key === "ArrowRight" ? 40 : -40;
              }}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain whitespace-nowrap rounded-widget [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs"
                  style={getTagStyles(tag.name, tag.color).badge}
                >
                  {tag.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div
        className={cn(
          "flex min-h-11 shrink-0 items-center justify-between gap-2 border-t border-border/60 px-3 py-1",
          compact && "sm:border-t-0",
        )}
        data-bookmark-action-row
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 min-w-0 px-2 font-normal tabular-nums text-muted-foreground [@media(pointer:coarse)]:min-h-11"
                aria-label="复制收藏时间"
                onClick={async () => {
                  if (await copyToClipboard(timestamp)) toast.success("已复制收藏时间");
                  else toast.error("复制失败，请重试");
                }}
              >
                <time dateTime={date.toISOString()} suppressHydrationWarning>
                  {formatRelativeTime(date.toISOString())}
                </time>
              </Button>
            </TooltipTrigger>
            <TooltipContent>收藏于 {timestamp} · 点击复制</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <BookmarkActions actions={actions} triggerRef={triggerRef} />
      </div>
    </div>
  );
}
