"use client";

import Image from "next/image";
import { Copy, FolderOpen, Link2 } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import {
  buildShortUrl,
  extractHostname,
  highlightMatches,
} from "@/models/links";
import type { HighlightSegment } from "@/models/links";
import type { Tag, Link  } from "@/models/types";
import { HighlightText } from "./highlight-text";
import { TagBadges } from "./tag-badges";

interface LinkResultItemProps {
  link: Link;
  trimmedQuery: string;
  folderName: string | null;
  tags: Tag[] | undefined;
  siteUrl: string;
  onOpenOriginalUrl: (url: string) => void;
  onCopyShortUrl: (slug: string) => void;
  onNavigateToFolder: (folderId: string) => void;
}

function Favicon({ src }: { src: string | null | undefined }) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={14}
        height={14}
        className="w-3.5 h-3.5 rounded-[3px]"
        unoptimized
      />
    );
  }
  return (
    <div className="w-3.5 h-3.5 rounded-[3px] bg-accent flex items-center justify-center">
      <Link2 className="w-2 h-2 text-muted-foreground/60" strokeWidth={2} />
    </div>
  );
}

function highlight(text: string, query: string): HighlightSegment[] {
  return highlightMatches(text, query);
}

function LinkMetaRow({
  link,
  trimmedQuery,
  folderName,
  tags,
  siteUrl,
  onCopyShortUrl,
  onNavigateToFolder,
}: Omit<LinkResultItemProps, "onOpenOriginalUrl">) {
  return (
    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground leading-none flex-wrap">
      <span className="flex items-center gap-0.5 shrink-0">
        <Link2 className="h-[9px] w-[9px] text-muted-foreground/60" strokeWidth={1.5} />
        <HighlightText segments={highlight(link.slug, trimmedQuery)} />
      </span>
      <button
        type="button"
        aria-label={`Copy ${buildShortUrl(siteUrl, link.slug)}`}
        className="shrink-0 rounded-sm p-px text-muted-foreground/60 hover:text-foreground transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onCopyShortUrl(link.slug);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            onCopyShortUrl(link.slug);
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
              if (link.folderId) onNavigateToFolder(link.folderId);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                if (link.folderId) onNavigateToFolder(link.folderId);
              }
            }}
          >
            <FolderOpen className="h-[9px] w-[9px]" />
            {folderName}
          </button>
        </>
      )}

      {tags && tags.length > 0 && (
        <>
          <span className="text-border">·</span>
          <TagBadges tags={tags} />
        </>
      )}
    </div>
  );
}

export function LinkResultItem(props: LinkResultItemProps) {
  const { link, trimmedQuery, onOpenOriginalUrl } = props;
  const hostname = extractHostname(link.originalUrl);
  const titleText = link.metaTitle || hostname;

  return (
    <CommandItem
      key={link.id}
      value={link.slug}
      className="flex items-start gap-2.5 py-2"
      onSelect={() => onOpenOriginalUrl(link.originalUrl)}
    >
      <div className="mt-0.5 shrink-0">
        <Favicon src={link.metaFavicon} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          <HighlightText segments={highlight(titleText, trimmedQuery)} />
        </p>
        {link.metaDescription && (
          <p className="truncate text-xs text-muted-foreground/70 mt-0.5 leading-tight">
            <HighlightText segments={highlight(link.metaDescription, trimmedQuery)} />
          </p>
        )}
        {link.note && (
          <p className="truncate text-xs text-muted-foreground/60 mt-0.5 italic leading-tight">
            <HighlightText segments={highlight(link.note, trimmedQuery)} />
          </p>
        )}
        <LinkMetaRow {...props} />
      </div>
    </CommandItem>
  );
}
