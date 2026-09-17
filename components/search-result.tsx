"use client";

import { CheckSquare, ExternalLink, FileText, Globe, Star } from "lucide-react";
import { GithubIcon } from "@/components/github-icon";
import {
  SEARCH_SOURCE_LABELS,
  type SearchHit,
  type SearchSegment,
  searchHighlight,
} from "@/models/search";

export function SearchHighlights({ segments }: { segments: SearchSegment[] }) {
  return segments.map((part, index) =>
    part.highlight ? (
      <mark
        // Text segments have no state and retain their positional meaning.
        // biome-ignore lint/suspicious/noArrayIndexKey: immutable highlight segments
        key={`${index}:${part.text}`}
        className="rounded-sm bg-amber-200/70 text-inherit dark:bg-amber-400/25"
      >
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

const stateLabel: Record<string, string> = {
  pending: "等待采集",
  running: "采集中",
  complete: "已采集",
  partial: "部分完成",
  failed: "采集失败",
  unavailable: "不可用",
};

/** A fixed icon column and two text rows keep keyboard selection stable. */
export function SearchResult({ hit, query }: { hit: SearchHit; query: string }) {
  const Icon =
    hit.source === "github"
      ? GithubIcon
      : hit.source === "idea"
        ? FileText
        : hit.source === "todo"
          ? CheckSquare
          : Globe;
  const meta = hit.metadata;
  return (
    <div className="flex w-full min-w-0 items-start gap-3 py-1">
      <div
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-widget bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        {hit.source === "x" ? (
          <span className="text-base font-semibold">𝕏</span>
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            <SearchHighlights segments={searchHighlight(hit.title, query)} />
          </span>
          {hit.originalTitle && (
            <span
              className="max-w-[30%] truncate text-xs text-muted-foreground"
              title={hit.originalTitle}
            >
              {hit.originalTitle}
            </span>
          )}
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {SEARCH_SOURCE_LABELS[hit.source]}
          </span>
          {hit.kind === "link" && (
            <ExternalLink
              className="ml-auto h-3 w-3 shrink-0 text-muted-foreground"
              aria-label="新标签页打开"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="max-w-full truncate">
            {meta.author ||
              meta.repository ||
              (hit.kind === "link"
                ? hit.url.replace(/^https?:\/\//, "")
                : new Date(hit.createdAt).toLocaleDateString("zh-CN"))}
          </span>
          {meta.language && <span>{meta.language}</span>}
          {meta.stars !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3" aria-hidden="true" />
              {meta.stars.toLocaleString("zh-CN")}
            </span>
          )}
          {meta.archived && <span>已归档</span>}
          {meta.done !== undefined && <span>{meta.done ? "已完成" : "未完成"}</span>}
          {meta.state && stateLabel[meta.state] && <span>{stateLabel[meta.state]}</span>}
          {hit.folderName && <span>{hit.folderName}</span>}
          {hit.tags.slice(0, 3).map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
        {hit.note && (
          <p className="line-clamp-1 text-sm text-foreground" title={hit.note}>
            {hit.note}
          </p>
        )}
        <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
          <span className="mr-2 text-[10px] font-medium opacity-75">{hit.match.label}</span>
          <SearchHighlights segments={hit.match.segments} />
        </p>
      </div>
    </div>
  );
}
