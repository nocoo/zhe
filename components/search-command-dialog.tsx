"use client";
import { Dialog, DialogContent, DialogTitle } from "@nocoo/basalt";
import { useTheme } from "@nocoo/basalt/providers/theme";
import { Monitor, Moon, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchResult } from "@/components/search-result";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDashboardState } from "@/contexts/dashboard-service";
import { normalizeSearchText } from "@/models/search";
import { useSearch } from "@/viewmodels/useSearch";
import {
  ActionGroup,
  type LauncherAction,
  PageJumpGroup,
} from "./search-command-dialog-parts/launcher-groups";
export interface SearchCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
/** Default action set wired to Basalt theme + the dialog open state. */
function useDefaultActions(onOpenChange: (open: boolean) => void): LauncherAction[] {
  const { setTheme } = useTheme();
  return useMemo(
    () => [
      {
        id: "theme-light",
        title: "切换到浅色主题",
        icon: Sun,
        search: "切换到浅色主题 theme light",
        run: () => {
          setTheme("light");
          onOpenChange(false);
        },
      },
      {
        id: "theme-dark",
        title: "切换到深色主题",
        icon: Moon,
        search: "切换到深色主题 theme dark",
        run: () => {
          setTheme("dark");
          onOpenChange(false);
        },
      },
      {
        id: "theme-system",
        title: "跟随系统主题",
        icon: Monitor,
        search: "跟随系统主题 theme system auto",
        run: () => {
          setTheme("system");
          onOpenChange(false);
        },
      },
    ],
    [setTheme, onOpenChange],
  );
}

export function SearchCommandDialog({ open, onOpenChange }: SearchCommandDialogProps) {
  const router = useRouter();
  const { siteUrl } = useDashboardState();
  const [selected, setSelected] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const result = useSearch(query, "all", 0, open);
  const hasQuery = Boolean(normalizeSearchText(query));
  const actions = useDefaultActions(onOpenChange);
  useEffect(() => {
    if (
      open &&
      document.activeElement instanceof HTMLElement &&
      !document.activeElement.closest('[role="dialog"]')
    )
      returnFocus.current = document.activeElement;
    if (!open) setQuery("");
  }, [open]);
  useEffect(() => {
    const first = result.data?.items[0];
    if (first) setSelected(first.slug || `${first.kind}-${first.id}`);
  }, [result.data]);
  const navigate = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="overflow-hidden p-0"
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          if (document.activeElement instanceof HTMLElement)
            returnFocus.current = document.activeElement;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">全局搜索</DialogTitle>
        <Command
          label="全局搜索"
          shouldFilter={false}
          value={selected}
          onValueChange={setSelected}
          className="flex flex-col"
        >
          <CommandInput
            placeholder="搜索链接、想法、待办 · 跳转页面 · 触发动作..."
            aria-label="全局搜索"
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setSelected("");
            }}
            maxLength={2000}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing && event.key === "Enter") event.stopPropagation();
            }}
          />
          <CommandList aria-busy={result.loading}>
            {!hasQuery && (
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                <Search className="h-5 w-5" />
                <p className="text-sm">输入关键词搜索</p>
                <p className="text-xs">搜索链接、X、GitHub、想法与待办的全文和标签</p>
              </div>
            )}
            {hasQuery && (
              <>
                {result.loading && (
                  <p role="status" className="px-4 py-5 text-sm text-muted-foreground">
                    正在搜索…
                  </p>
                )}
                {result.error && (
                  <div role="alert" className="p-4 text-sm text-destructive">
                    {result.error}
                    <button type="button" className="ml-2 underline" onClick={result.retry}>
                      重试
                    </button>
                  </div>
                )}
                {result.data && (
                  <CommandGroup heading={`搜索结果 (${result.data.total})`}>
                    {result.data.items.map((hit) => (
                      <CommandItem
                        key={`${hit.kind}:${hit.id}`}
                        value={hit.slug || `${hit.kind}-${hit.id}`}
                        className="items-start px-3 py-2"
                        onSelect={() => {
                          if (hit.kind === "link") {
                            window.open(hit.url, "_blank", "noopener,noreferrer");
                            onOpenChange(false);
                          } else navigate(hit.url);
                        }}
                      >
                        <SearchResult hit={hit} query={query} />
                        {hit.kind === "link" && (
                          <div className="flex shrink-0 gap-2 self-center text-xs">
                            {hit.folderId && (
                              <button
                                type="button"
                                className="rounded px-1 py-2 text-muted-foreground hover:text-foreground"
                                aria-label={`打开分类 ${hit.folderName}`}
                                onKeyDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(
                                    `/dashboard?folder=${encodeURIComponent(hit.folderId ?? "")}`,
                                  );
                                }}
                              >
                                分类
                              </button>
                            )}
                            {hit.slug && (
                              <button
                                type="button"
                                className="rounded px-1 py-2 text-muted-foreground hover:text-foreground"
                                aria-label={`复制短链接 ${hit.slug}`}
                                onKeyDown={(e) => e.stopPropagation()}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const button = e.currentTarget;
                                  try {
                                    await navigator.clipboard.writeText(`${siteUrl}/${hit.slug}`);
                                    onOpenChange(false);
                                  } catch {
                                    button.textContent = "复制失败";
                                  }
                                }}
                              >
                                复制
                              </button>
                            )}
                          </div>
                        )}
                      </CommandItem>
                    ))}
                    {result.data.total === 0 && (
                      <p className="px-2 py-4 text-sm text-muted-foreground">没有找到匹配的结果</p>
                    )}
                  </CommandGroup>
                )}
                <CommandGroup>
                  <CommandItem
                    value="view-all-search-results"
                    disabled={result.loading}
                    onSelect={() => navigate(`/dashboard/search?q=${encodeURIComponent(query)}`)}
                  >
                    查看全部搜索结果 →
                  </CommandItem>
                </CommandGroup>
              </>
            )}
            <PageJumpGroup query={query} onNavigate={navigate} />
            <ActionGroup query={query} actions={actions} />
          </CommandList>
          <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            ↑ ↓ 选择 · Enter 打开 · Esc 关闭
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
export { CommandItem };
