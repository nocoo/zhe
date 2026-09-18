"use client";

import { CheckSquare, ExternalLink, FileText, Globe, Star } from "lucide-react";
import { GithubIcon, TwitterIcon } from "@/components/site-icons";
import {
  SEARCH_SOURCE_LABELS,
  type SearchHit,
  type SearchSegment,
  searchHighlight,
  searchSnippet,
  searchTerms,
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

/** The same compact result layout serves the launcher and full search page. */
export function SearchResult({ hit, query }: { hit: SearchHit; query: string }) {
  const Icon =
    hit.source === "github"
      ? GithubIcon
      : hit.source === "x"
        ? TwitterIcon
        : hit.source === "idea"
          ? FileText
          : hit.source === "todo"
            ? CheckSquare
            : Globe;
  const meta = hit.metadata;
  const matches = hit.matches ?? [hit.match];
  const evidence = matches.filter(
    (match) =>
      match.label !== "标题" &&
      match.label !== "备注" &&
      (match.label !== "语言" || !meta.language),
  );
  const summary = hit.note || (evidence.length === 0 ? hit.preview : undefined);
  const tags = [...hit.tags]
    .sort(
      (a, b) =>
        Number(searchTerms(query).some((term) => b.toLowerCase().includes(term))) -
        Number(searchTerms(query).some((term) => a.toLowerCase().includes(term))),
    )
    .slice(0, 2);
  return (
    <div className="flex w-full min-w-0 items-start gap-3">
      <div
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-widget border border-border/60 text-muted-foreground"
        aria-hidden="true"
      >
        <Icon className="size-4" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            <SearchHighlights segments={searchHighlight(hit.title, query)} />
          </span>
          {hit.originalTitle && (
            <span
              className="hidden max-w-[30%] truncate text-xs text-muted-foreground sm:inline"
              title={hit.originalTitle}
            >
              <SearchHighlights segments={searchHighlight(hit.originalTitle, query)} />
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {SEARCH_SOURCE_LABELS[hit.source]}
          </span>
          {hit.kind === "link" && (
            <ExternalLink
              className="size-3 shrink-0 text-muted-foreground"
              aria-label="新标签页打开"
            />
          )}
        </div>
        {summary && (
          <p
            className={`line-clamp-2 break-words text-sm leading-relaxed ${hit.note ? "text-foreground" : "text-muted-foreground"}`}
          >
            <SearchHighlights segments={searchSnippet(summary, query)} />
          </p>
        )}
        {evidence.slice(0, 2).map((match) => (
          <p
            key={`${match.label}:${match.segments.map((part) => part.text).join("")}`}
            className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground"
          >
            <span className="mr-2 font-medium">{match.label}</span>
            <SearchHighlights segments={match.segments} />
          </p>
        ))}
        <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            <SearchHighlights
              segments={searchHighlight(
                meta.author ||
                  meta.repository ||
                  (hit.kind === "link"
                    ? hit.url.replace(/^https?:\/\//, "")
                    : new Date(hit.createdAt).toLocaleDateString("zh-CN")),
                query,
              )}
            />
          </span>
          {meta.language && (
            <span className="shrink-0">
              <SearchHighlights segments={searchHighlight(meta.language, query)} />
            </span>
          )}
          {meta.stars !== undefined && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Star className="size-3" aria-hidden="true" />
              {Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(
                meta.stars,
              )}
            </span>
          )}
          {meta.mediaTypes?.map((type) => (
            <span key={type} className="shrink-0">
              {type}
            </span>
          ))}
          {meta.archived && <span className="shrink-0">已归档</span>}
          {meta.done !== undefined && (
            <span className="shrink-0">{meta.done ? "已完成" : "未完成"}</span>
          )}
          {meta.state && meta.state !== "complete" && stateLabel[meta.state] && (
            <span className="shrink-0">{stateLabel[meta.state]}</span>
          )}
          {hit.folderName && (
            <span className="max-w-24 truncate">
              <SearchHighlights segments={searchHighlight(hit.folderName, query)} />
            </span>
          )}
          {tags.map((tag) => (
            <span key={tag} className="max-w-24 truncate">
              #<SearchHighlights segments={searchHighlight(tag, query)} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
