"use client";
import { Button, Input } from "@nocoo/basalt";
import { ArrowLeft, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchResult } from "@/components/search-result";
import { SearchSourceFilter } from "@/components/search-source-filter";
import { normalizeSearchText, SEARCH_SOURCES, type SearchFilter } from "@/models/search";
import { useSearch } from "@/viewmodels/useSearch";

export function SearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const initialSource = params.get("source");
  const selectedSource: SearchFilter = SEARCH_SOURCES.includes(initialSource as never)
    ? (initialSource as SearchFilter)
    : "all";
  const [source, setSource] = useState<SearchFilter>(selectedSource);
  const [offset, setOffset] = useState(0);
  const result = useSearch(query, source, offset);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    setQuery(initial);
    setSource(selectedSource);
    setOffset(0);
  }, [initial, selectedSource]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URL(window.location.href);
      if (query) next.searchParams.set("q", query);
      else next.searchParams.delete("q");
      if (source !== "all") next.searchParams.set("source", source);
      else next.searchParams.delete("source");
      window.history.replaceState(null, "", next);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, source]);
  function keyboard(event: React.KeyboardEvent) {
    if (event.nativeEvent.isComposing || document.querySelector('[role="dialog"]')) return;
    if (event.key === "Escape") {
      event.preventDefault();
      router.back();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const links = Array.from(
      list.current?.querySelectorAll<HTMLAnchorElement>("a[data-search-result]") ?? [],
    );
    if (!links.length) return;
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (
      index < 0 &&
      (event.target !== input.current || event.key === "Home" || event.key === "End")
    )
      return;
    event.preventDefault();
    links[
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? links.length - 1
          : index < 0
            ? event.key === "ArrowDown"
              ? 0
              : links.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length
    ]?.focus();
  }
  return (
    <section
      aria-label="搜索结果"
      className="mx-auto flex w-full max-w-4xl flex-col"
      onKeyDown={keyboard}
    >
      <div className="mb-5 flex items-start gap-3">
        <Button size="sm" variant="ghost" aria-label="返回" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">搜索</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            在链接、X、GitHub、想法和待办中查找 · ↑ ↓ 选择 · Enter 打开 · Esc 返回
          </p>
        </div>
      </div>
      <div className="relative">
        <Search
          className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={input}
          aria-label="搜索关键词"
          placeholder="标题、正文、账号、仓库、标签或 URL…"
          value={query}
          maxLength={2000}
          size="lg"
          className="pl-9"
          onChange={(event) => {
            setQuery(event.target.value);
            setOffset(0);
          }}
        />
      </div>
      <div className="my-3">
        <SearchSourceFilter
          value={source}
          counts={result.data?.counts}
          onChange={(value) => {
            setSource(value);
            setOffset(0);
          }}
        />
      </div>
      <div aria-live="polite" aria-atomic="true" className="mb-2 text-xs text-muted-foreground">
        {result.loading
          ? result.message || "正在搜索…"
          : result.data
            ? `${result.data.total} 个结果 · 按相关性排序`
            : ""}
      </div>
      {!normalizeSearchText(query) && (
        <div className="py-16 text-center text-muted-foreground">
          <Search className="mx-auto mb-3 h-7 w-7 opacity-50" />
          <p className="text-sm">输入关键词，找回收藏与记录</p>
          <p className="mt-2 text-xs">可组合作者、标签和正文关键词，用空格分开</p>
        </div>
      )}
      {result.error && (
        <div role="alert" className="rounded-widget border p-6 text-center">
          <p className="mb-3 text-sm">{result.error}</p>
          <Button size="sm" onClick={result.retry}>
            重试搜索
          </Button>
        </div>
      )}
      {result.loading && (
        <div aria-hidden="true" className="space-y-3 py-3">
          {[1, 2, 3, 4].map((key) => (
            <div key={key} className="h-20 animate-pulse rounded-widget bg-muted/60" />
          ))}
        </div>
      )}
      {result.data?.total === 0 && (
        <div className="py-16 text-center">
          <p className="text-sm font-medium">没有找到匹配的结果</p>
          <p className="mt-2 text-xs text-muted-foreground">试试更短的关键词，或选择其他来源</p>
        </div>
      )}
      <ul
        ref={list}
        aria-label="匹配结果"
        aria-busy={result.loading}
        className="divide-y divide-border/60"
      >
        {result.data?.items.map((hit) => (
          <li key={`${hit.kind}:${hit.id}`}>
            <a
              data-search-result
              href={hit.url}
              target={hit.kind === "link" ? "_blank" : undefined}
              rel={hit.kind === "link" ? "noopener noreferrer" : undefined}
              className="block rounded-widget px-3 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SearchResult hit={hit} query={query} />
            </a>
          </li>
        ))}
      </ul>
      {result.data && result.data.total > 20 && (
        <nav aria-label="搜索分页" className="mt-5 flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={!offset}
            onClick={() => {
              setOffset(offset - 20);
              input.current?.focus();
            }}
          >
            上一页
          </Button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}–{Math.min(offset + 20, result.data.total)} / {result.data.total}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={offset + 20 >= result.data.total}
            onClick={() => {
              setOffset(offset + 20);
              input.current?.focus();
            }}
          >
            下一页
          </Button>
        </nav>
      )}
    </section>
  );
}
