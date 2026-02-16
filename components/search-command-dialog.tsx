"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, FolderOpen, Copy } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDashboardService } from "@/contexts/dashboard-service";
import { buildShortUrl, stripProtocol, filterLinks } from "@/models/links";

export interface SearchCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchCommandDialog({
  open,
  onOpenChange,
}: SearchCommandDialogProps) {
  const { links, folders, siteUrl } = useDashboardService();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  /** Filter links using substring match instead of cmdk fuzzy matching */
  const filteredLinks = useMemo(
    () => filterLinks(links, searchQuery),
    [links, searchQuery],
  );

  /** Find the folder a link belongs to */
  const getFolderName = useCallback(
    (folderId: string | null) => {
      if (!folderId) return null;
      return folders.find((f) => f.id === folderId)?.name ?? null;
    },
    [folders],
  );

  /** Navigate to the link's folder (or "all links" if uncategorized) */
  const handleNavigateToFolder = useCallback(
    (folderId: string | null) => {
      onOpenChange(false);
      if (folderId) {
        router.push(`/dashboard?folder=${folderId}`);
      } else {
        router.push("/dashboard?folder=uncategorized");
      }
    },
    [onOpenChange, router],
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

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="搜索链接..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        <CommandEmpty>没有找到匹配的链接</CommandEmpty>
        <CommandGroup heading="链接">
          {filteredLinks.map((link) => {
            const folderName = getFolderName(link.folderId);
            const shortUrl = buildShortUrl(siteUrl, link.slug);

            return (
              <CommandItem
                key={link.id}
                value={link.slug}
                className="flex items-center justify-between gap-2"
                onSelect={() => handleNavigateToFolder(link.folderId)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {stripProtocol(shortUrl)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {stripProtocol(link.originalUrl)}
                    </p>
                  </div>
                  {folderName && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <FolderOpen className="h-3 w-3" />
                      {folderName}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Copy ${shortUrl}`}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
