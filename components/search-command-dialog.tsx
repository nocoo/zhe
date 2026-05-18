"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDashboardState, useDashboardActions } from "@/contexts/dashboard-service";
import { buildShortUrl, filterLinks } from "@/models/links";
import { filterIdeas } from "@/models/ideas";
import type { Tag } from "@/models/types";
import { LinkResultItem } from "./search-command-dialog-parts/link-result-item";
import { IdeaResultItem } from "./search-command-dialog-parts/idea-result-item";

export interface SearchCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Build a Map from link_id → Tag[] for O(1) lookup during render. */
function useTagsByLinkId(tags: Tag[], linkTags: { linkId: number; tagId: string }[]) {
  return useMemo(() => {
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
}

function useTagsByIdeaId(tags: Tag[], ideas: { id: number; tagIds: string[] }[]) {
  return useMemo(() => {
    const tagById = new Map<string, Tag>();
    for (const t of tags) tagById.set(t.id, t);
    const result = new Map<number, Tag[]>();
    for (const idea of ideas) {
      const ideaTags: Tag[] = [];
      for (const tagId of idea.tagIds) {
        const tag = tagById.get(tagId);
        if (tag) ideaTags.push(tag);
      }
      if (ideaTags.length > 0) result.set(idea.id, ideaTags);
    }
    return result;
  }, [tags, ideas]);
}

function useSearchHandlers(onOpenChange: (open: boolean) => void, siteUrl: string) {
  const router = useRouter();

  const handleNavigateToFolder = useCallback(
    (folderId: string) => {
      onOpenChange(false);
      router.push(`/dashboard?folder=${folderId}`);
    },
    [onOpenChange, router],
  );

  const handleOpenOriginalUrl = useCallback(
    (url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const handleCopyShortUrl = useCallback(
    async (slug: string) => {
      await navigator.clipboard.writeText(buildShortUrl(siteUrl, slug));
      onOpenChange(false);
    },
    [siteUrl, onOpenChange],
  );

  const handleNavigateToIdea = useCallback(
    (ideaId: number) => {
      onOpenChange(false);
      router.push(`/dashboard/ideas/${ideaId}`);
    },
    [onOpenChange, router],
  );

  return { handleNavigateToFolder, handleOpenOriginalUrl, handleCopyShortUrl, handleNavigateToIdea };
}

function SearchEmptyHint() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Search className="h-6 w-6 mb-3 text-muted-foreground/40" />
      <p className="text-sm">输入关键词搜索</p>
      <p className="text-xs text-muted-foreground/60 mt-1">
        支持搜索短链、URL、标题、描述、备注、想法、标签
      </p>
    </div>
  );
}

export function SearchCommandDialog({
  open,
  onOpenChange,
}: SearchCommandDialogProps) {
  const { links, folders, tags, linkTags, siteUrl, ideas } = useDashboardState();
  const { ensureIdeasLoaded } = useDashboardActions();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) ensureIdeasLoaded();
  }, [open, ensureIdeasLoaded]);

  const trimmedQuery = searchQuery.trim();
  const hasQuery = trimmedQuery.length > 0;

  const filteredLinks = useMemo(
    () => filterLinks(links, searchQuery, { tags, linkTags }),
    [links, searchQuery, tags, linkTags],
  );
  const filteredIdeas = useMemo(
    () => filterIdeas(ideas, searchQuery, { tags }),
    [ideas, searchQuery, tags],
  );

  const tagsByLinkId = useTagsByLinkId(tags, linkTags);
  const tagsByIdeaId = useTagsByIdeaId(tags, ideas);

  const folderNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of folders) map.set(f.id, f.name);
    return map;
  }, [folders]);

  const getFolderName = useCallback(
    (folderId: string | null) => (folderId ? folderNameMap.get(folderId) ?? null : null),
    [folderNameMap],
  );

  const handlers = useSearchHandlers(onOpenChange, siteUrl);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="搜索链接、想法、标题、备注、标签..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        {!hasQuery ? (
          <SearchEmptyHint />
        ) : (
          <>
            <CommandEmpty>没有找到匹配的结果</CommandEmpty>
            {filteredLinks.length > 0 && (
              <CommandGroup heading={`链接 (${filteredLinks.length})`}>
                {filteredLinks.map((link) => (
                  <LinkResultItem
                    key={link.id}
                    link={link}
                    trimmedQuery={trimmedQuery}
                    folderName={getFolderName(link.folderId)}
                    tags={tagsByLinkId.get(link.id)}
                    siteUrl={siteUrl}
                    onOpenOriginalUrl={handlers.handleOpenOriginalUrl}
                    onCopyShortUrl={handlers.handleCopyShortUrl}
                    onNavigateToFolder={handlers.handleNavigateToFolder}
                  />
                ))}
              </CommandGroup>
            )}

            {filteredIdeas.length > 0 && (
              <CommandGroup heading={`想法 (${filteredIdeas.length})`}>
                {filteredIdeas.map((idea) => (
                  <IdeaResultItem
                    key={`idea-${idea.id}`}
                    idea={idea}
                    trimmedQuery={trimmedQuery}
                    tags={tagsByIdeaId.get(idea.id)}
                    onNavigate={handlers.handleNavigateToIdea}
                  />
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

// CommandItem is re-exported so that tests/snapshots referencing it don't break.
export { CommandItem };
