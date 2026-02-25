"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Link2, FolderOpen, Copy, Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDashboardState } from "@/contexts/dashboard-service";
import {
  buildShortUrl,
  filterLinks,
  extractHostname,
  highlightMatches,
} from "@/models/links";
import type { HighlightSegment } from "@/models/links";
import { getTagColorClassesByName } from "@/models/tags";
import type { Tag } from "@/models/types";

export interface SearchCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Render text with highlighted keyword matches */
function HighlightText({
  segments,
  className,
}: {
  segments: HighlightSegment[];
  className?: string;
}) {
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark
            key={i}
            className="bg-yellow-200/60 text-foreground rounded-sm px-0.5 dark:bg-yellow-500/30"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

export function SearchCommandDialog({
  open,
  onOpenChange,
}: SearchCommandDialogProps) {
  const { links, folders, tags, linkTags, siteUrl } = useDashboardState();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const trimmedQuery = searchQuery.trim();

  /** Filter links using substring match instead of cmdk fuzzy matching */
  const filteredLinks = useMemo(
    () => filterLinks(links, searchQuery, { tags, linkTags }),
    [links, searchQuery, tags, linkTags],
  );

  /** Build a lookup: linkId → Tag[] for rendering tag badges */
  const tagsByLinkId = useMemo(() => {
    const tagById = new Map<string, Tag>();
    for (const t of tags) tagById.set(t.id, t);
    const result = new Map<number, Tag[]>();
    for (const lt of linkTags) {
      const tag = tagById.get(lt.tagId);
      if (!tag) continue;
      let arr = result.get(lt.linkId);
      if (!arr) {
        arr = [];
        result.set(lt.linkId, arr);
      }
      arr.push(tag);
    }
    return result;
  }, [tags, linkTags]);

  /** Find the folder a link belongs to */
  const getFolderName = useCallback(
    (folderId: string | null) => {
      if (!folderId) return null;
      return folders.find((f) => f.id === folderId)?.name ?? null;
    },
    [folders],
  );

  /** Navigate to the link's folder */
  const handleNavigateToFolder = useCallback(
    (folderId: string) => {
      onOpenChange(false);
      router.push(`/dashboard?folder=${folderId}`);
    },
    [onOpenChange, router],
  );

  /** Open the original URL in a new tab */
  const handleOpenOriginalUrl = useCallback(
    (url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
      onOpenChange(false);
    },
    [onOpenChange],
  );

  /** Copy the short URL to clipboard */
  const handleCopyShortUrl = useCallback(
    async (slug: string) => {
      const shortUrl = buildShortUrl(siteUrl, slug);
      await navigator.clipboard.writeText(shortUrl);
      onOpenChange(false);
    },
    [siteUrl, onOpenChange],
  );

  const hasQuery = trimmedQuery.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="搜索链接、标题、备注、标签..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        {/* When input is empty, show a hint instead of empty state */}
        {!hasQuery ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-8 w-8 mb-3 text-muted-foreground/40" />
            <p className="text-sm">输入关键词搜索链接</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              支持搜索短链、URL、标题、描述、备注、标签
            </p>
          </div>
        ) : (
          <>
            <CommandEmpty>没有找到匹配的链接</CommandEmpty>
            <CommandGroup heading={`链接 (${filteredLinks.length})`}>
              {filteredLinks.map((link) => {
                const folderName = getFolderName(link.folderId);
                const linkTagList = tagsByLinkId.get(link.id);
                const hostname = extractHostname(link.originalUrl);
                const titleText = link.metaTitle || hostname;

                return (
                  <CommandItem
                    key={link.id}
                    value={link.slug}
                    className="flex items-start gap-3 py-2.5"
                    onSelect={() => handleOpenOriginalUrl(link.originalUrl)}
                  >
                    {/* Favicon */}
                    <div className="mt-0.5 shrink-0">
                      {link.metaFavicon ? (
                        <Image
                          src={link.metaFavicon}
                          alt=""
                          width={16}
                          height={16}
                          className="w-4 h-4 rounded-sm"
                          unoptimized
                        />
                      ) : (
                        <div className="w-4 h-4 rounded-sm bg-accent flex items-center justify-center">
                          <Link2 className="w-3 h-3 text-muted-foreground/60" strokeWidth={2} />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {/* Title row */}
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          <HighlightText
                            segments={highlightMatches(titleText, trimmedQuery)}
                          />
                        </p>
                      </div>

                      {/* Description (if available) */}
                      {link.metaDescription && (
                        <p className="truncate text-xs text-muted-foreground/70 mt-0.5">
                          <HighlightText
                            segments={highlightMatches(
                              link.metaDescription,
                              trimmedQuery,
                            )}
                          />
                        </p>
                      )}

                      {/* Note (if available) */}
                      {link.note && (
                        <p className="truncate text-xs text-muted-foreground/60 mt-0.5 italic">
                          <HighlightText
                            segments={highlightMatches(link.note, trimmedQuery)}
                          />
                        </p>
                      )}

                      {/* Slug row with copy button */}
                      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-0.5 shrink-0">
                          <Link2 className="h-3 w-3" strokeWidth={1.5} />
                          <HighlightText
                            segments={highlightMatches(
                              link.slug,
                              trimmedQuery,
                            )}
                          />
                        </span>
                        <button
                          type="button"
                          aria-label={`Copy ${buildShortUrl(siteUrl, link.slug)}`}
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyShortUrl(link.slug);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              handleCopyShortUrl(link.slug);
                            }
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Folder and tags row */}
                      {(folderName || (linkTagList && linkTagList.length > 0)) && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {folderName && link.folderId && (
                            <button
                              type="button"
                              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNavigateToFolder(link.folderId!);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.stopPropagation();
                                  handleNavigateToFolder(link.folderId!);
                                }
                              }}
                            >
                              <FolderOpen className="h-3 w-3" />
                              {folderName}
                            </button>
                          )}
                          {linkTagList && linkTagList.length > 0 && (
                            <>
                              {linkTagList.slice(0, 3).map((tag) => {
                                const colors = getTagColorClassesByName(tag.name);
                                return (
                                  <span
                                    key={tag.id}
                                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors.badge}`}
                                  >
                                    <span
                                      className={`h-1 w-1 rounded-full ${colors.dot}`}
                                    />
                                    {tag.name}
                                  </span>
                                );
                              })}
                              {linkTagList.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{linkTagList.length - 3}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
