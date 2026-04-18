"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Link2, FolderOpen, Copy, Search, Lightbulb } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDashboardState, useDashboardActions } from "@/contexts/dashboard-service";
import {
  buildShortUrl,
  filterLinks,
  extractHostname,
  highlightMatches,
} from "@/models/links";
import type { HighlightSegment } from "@/models/links";
import { filterIdeas } from "@/models/ideas";
import { getTagStyles } from "@/models/tags";
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
            className="bg-highlight/60 text-foreground rounded-sm px-0.5"
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

/** Format date for idea title display when no title is provided */
function formatIdeaDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function SearchCommandDialog({
  open,
  onOpenChange,
}: SearchCommandDialogProps) {
  const { links, folders, tags, linkTags, siteUrl, ideas } = useDashboardState();
  const { ensureIdeasLoaded } = useDashboardActions();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  // Lazy-load ideas when the dialog opens
  useEffect(() => {
    if (open) {
      ensureIdeasLoaded();
    }
  }, [open, ensureIdeasLoaded]);

  const trimmedQuery = searchQuery.trim();

  /** Filter links using substring match instead of cmdk fuzzy matching */
  const filteredLinks = useMemo(
    () => filterLinks(links, searchQuery, { tags, linkTags }),
    [links, searchQuery, tags, linkTags],
  );

  /** Filter ideas using substring match on title, excerpt, tags */
  const filteredIdeas = useMemo(
    () => filterIdeas(ideas, searchQuery, { tags }),
    [ideas, searchQuery, tags],
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

  /** Navigate to the idea editor page */
  const handleNavigateToIdea = useCallback(
    (ideaId: number) => {
      onOpenChange(false);
      router.push(`/dashboard/ideas/${ideaId}`);
    },
    [onOpenChange, router],
  );

  /** Build a lookup: ideaId → Tag[] for rendering tag badges */
  const tagsByIdeaId = useMemo(() => {
    const tagById = new Map<string, Tag>();
    for (const t of tags) tagById.set(t.id, t);
    const result = new Map<number, Tag[]>();
    for (const idea of ideas) {
      const ideaTags: Tag[] = [];
      for (const tagId of idea.tagIds) {
        const tag = tagById.get(tagId);
        if (tag) ideaTags.push(tag);
      }
      if (ideaTags.length > 0) {
        result.set(idea.id, ideaTags);
      }
    }
    return result;
  }, [ideas, tags]);

  const hasQuery = trimmedQuery.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="搜索链接、想法、标题、备注、标签..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        {/* When input is empty, show a hint instead of empty state */}
        {!hasQuery ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-6 w-6 mb-3 text-muted-foreground/40" />
            <p className="text-sm">输入关键词搜索</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              支持搜索短链、URL、标题、描述、备注、想法、标签
            </p>
          </div>
        ) : (
          <>
            <CommandEmpty>没有找到匹配的结果</CommandEmpty>
            {filteredLinks.length > 0 && (
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
                    className="flex items-start gap-2.5 py-2"
                    onSelect={() => handleOpenOriginalUrl(link.originalUrl)}
                  >
                    {/* Favicon */}
                    <div className="mt-0.5 shrink-0">
                      {link.metaFavicon ? (
                        <Image
                          src={link.metaFavicon}
                          alt=""
                          width={14}
                          height={14}
                          className="w-3.5 h-3.5 rounded-[3px]"
                          unoptimized
                        />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-[3px] bg-accent flex items-center justify-center">
                          <Link2 className="w-2 h-2 text-muted-foreground/60" strokeWidth={2} />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {/* Title */}
                      <p className="truncate text-sm font-medium leading-tight">
                        <HighlightText
                          segments={highlightMatches(titleText, trimmedQuery)}
                        />
                      </p>

                      {/* Description (if available) */}
                      {link.metaDescription && (
                        <p className="truncate text-xs text-muted-foreground/70 mt-0.5 leading-tight">
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
                        <p className="truncate text-xs text-muted-foreground/60 mt-0.5 italic leading-tight">
                          <HighlightText
                            segments={highlightMatches(link.note, trimmedQuery)}
                          />
                        </p>
                      )}

                      {/* Meta row: slug + copy, folder, tags — all in one line */}
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground leading-none flex-wrap">
                        <span className="flex items-center gap-0.5 shrink-0">
                          <Link2 className="h-[9px] w-[9px] text-muted-foreground/60" strokeWidth={1.5} />
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
                          className="shrink-0 rounded-sm p-px text-muted-foreground/60 hover:text-foreground transition-colors"
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
                          <Copy className="h-[9px] w-[9px]" />
                        </button>

                        {folderName && link.folderId && (
                          <>
                            <span className="text-border">·</span>
                            <button
                              type="button"
                              className="flex items-center gap-0.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (link.folderId) handleNavigateToFolder(link.folderId);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.stopPropagation();
                                  if (link.folderId) handleNavigateToFolder(link.folderId);
                                }
                              }}
                            >
                              <FolderOpen className="h-[9px] w-[9px]" />
                              {folderName}
                            </button>
                          </>
                        )}

                        {linkTagList && linkTagList.length > 0 && (
                          <>
                            <span className="text-border">·</span>
                            {linkTagList.slice(0, 3).map((tag) => {
                              const styles = getTagStyles(tag.name);
                              return (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-normal"
                                  style={styles.badge}
                                >
                                  <span
                                    className="h-1 w-1 rounded-full"
                                    style={styles.dot}
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
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            )}

            {/* Ideas group */}
            {filteredIdeas.length > 0 && (
              <CommandGroup heading={`想法 (${filteredIdeas.length})`}>
                {filteredIdeas.map((idea) => {
                  const ideaTagList = tagsByIdeaId.get(idea.id);
                  const displayTitle = idea.title || formatIdeaDate(idea.createdAt);

                  return (
                    <CommandItem
                      key={`idea-${idea.id}`}
                      value={`idea-${idea.id}`}
                      className="flex items-start gap-2.5 py-2"
                      onSelect={() => handleNavigateToIdea(idea.id)}
                    >
                      {/* Icon */}
                      <div className="mt-0.5 shrink-0">
                        <div className="w-3.5 h-3.5 rounded-[3px] bg-accent flex items-center justify-center">
                          <Lightbulb className="w-2 h-2 text-muted-foreground/60" strokeWidth={2} />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        {/* Title */}
                        <p className="truncate text-sm font-medium leading-tight">
                          <HighlightText
                            segments={highlightMatches(displayTitle, trimmedQuery)}
                          />
                        </p>

                        {/* Excerpt (if available) */}
                        {idea.excerpt && (
                          <p className="truncate text-xs text-muted-foreground/70 mt-0.5 leading-tight">
                            <HighlightText
                              segments={highlightMatches(idea.excerpt, trimmedQuery)}
                            />
                          </p>
                        )}

                        {/* Tags row */}
                        {ideaTagList && ideaTagList.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground leading-none flex-wrap">
                            {ideaTagList.slice(0, 3).map((tag) => {
                              const styles = getTagStyles(tag.color);
                              return (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-normal"
                                  style={styles.badge}
                                >
                                  <span
                                    className="h-1 w-1 rounded-full"
                                    style={styles.dot}
                                  />
                                  {tag.name}
                                </span>
                              );
                            })}
                            {ideaTagList.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{ideaTagList.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
