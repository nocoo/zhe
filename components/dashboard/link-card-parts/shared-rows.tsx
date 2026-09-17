"use client";

import { Check, Copy, Link2 } from "lucide-react";
import Image from "next/image";
import { canonicalXPost } from "@/cli/src/connector/core";
import { XIcon } from "@/components/x-icon";
import { linkPresentation } from "@/models/link-presentation";
import type { Link } from "@/models/types";
import { CardText, CardTitleText } from "./curated-text";

/** Favicon image with fallback to placeholder square. */
export function Favicon({
  link,
  show,
  onError,
  size = "md",
}: {
  link: Link;
  show: boolean;
  onError: () => void;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? 14 : 16;
  const cls = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const iconCls = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";
  if (show && link.metaFavicon) {
    return (
      <Image
        src={link.metaFavicon}
        alt="favicon"
        width={dim}
        height={dim}
        className={`${cls} box-content shrink-0 rounded-sm bg-white p-0.5 object-contain scheme-light`}
        unoptimized
        onError={onError}
      />
    );
  }
  return (
    <div className={`${cls} shrink-0 rounded-sm bg-accent flex items-center justify-center`}>
      <Link2 className={`${iconCls} text-muted-foreground/60`} strokeWidth={2} />
    </div>
  );
}

/** Shared title mapping never uses the note as a heading. */
function TitleAnchor({
  href,
  title,
  titleText,
  onOpenDetails,
}: {
  href: string;
  title: string | null;
  titleText: string;
  onOpenDetails?: (() => void) | undefined;
}) {
  const content = (
    <CardTitleText
      title={title?.trim() || titleText}
      original={title?.trim() && title.trim() !== titleText ? titleText : ""}
    />
  );
  const className =
    "min-w-0 truncate text-left text-sm font-medium leading-5 text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (onOpenDetails)
    return (
      <button type="button" onClick={onOpenDetails} className={className}>
        {content}
      </button>
    );
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  );
}

/** Small copy button used in the title row to copy the original URL. */
function CopyOriginalButton({
  copied,
  onClick,
  size,
}: {
  copied: boolean;
  onClick: (e: React.MouseEvent) => void;
  size: "sm" | "md";
}) {
  const cls = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Copy original URL"
      className={`shrink-0 flex ${cls} items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors`}
      title="Copy original URL"
    >
      {copied ? (
        <Check className="w-3 h-3 text-success" strokeWidth={1.5} />
      ) : (
        <Copy className="w-3 h-3" strokeWidth={1.5} />
      )}
    </button>
  );
}

interface TitleRowProps {
  link: Link;
  titleText: string;
  showFaviconImage: boolean;
  copiedOriginalUrl: boolean;
  onFaviconError: () => void;
  onCopyOriginalUrl: () => void;
  /** Grid mode wraps in a tighter gap-1.5 row, list mode uses gap-2 mb-1. */
  variant: "grid" | "list";
  /** When true, the copy click stops propagation (used in grid's click-through wrapper). */
  stopPropagationOnCopy?: boolean;
  onOpenDetails?: (() => void) | undefined;
}

/** Unified favicon + title + copy-URL row, shared between grid + list. */
export function TitleRow({
  link,
  titleText,
  showFaviconImage,
  copiedOriginalUrl,
  onFaviconError,
  onCopyOriginalUrl,
  variant,
  stopPropagationOnCopy = false,
  onOpenDetails,
}: TitleRowProps) {
  const rowCls = variant === "grid" ? "flex items-center gap-1.5" : "flex items-center gap-2 mb-1";
  return (
    <div className={rowCls}>
      {onOpenDetails ? (
        <XIcon className="size-3.5 shrink-0 text-foreground" />
      ) : (
        <Favicon
          link={link}
          show={showFaviconImage}
          onError={onFaviconError}
          size={variant === "grid" ? "sm" : "md"}
        />
      )}
      <TitleAnchor
        href={link.originalUrl}
        title={link.title}
        titleText={titleText}
        onOpenDetails={onOpenDetails}
      />
      <CopyOriginalButton
        copied={copiedOriginalUrl}
        onClick={(e) => {
          if (stopPropagationOnCopy) e.stopPropagation();
          onCopyOriginalUrl();
        }}
        size={variant === "grid" ? "sm" : "md"}
      />
    </div>
  );
}

/** Description paragraph or "click to fetch" hint when metadata is missing. */
export function Description({
  link,
  isRefreshingMetadata,
  onRefresh,
  variant,
}: {
  link: Link;
  isRefreshingMetadata: boolean;
  onRefresh: () => void;
  variant: "grid" | "list";
}) {
  const display = linkPresentation(link);
  if (display.description)
    return (
      <div className="min-w-0 space-y-1">
        <CardText
          text={display.description}
          singleLine={variant === "list"}
          code={Boolean(display.note && canonicalXPost(link.originalUrl))}
        />
        {display.originalDescription && <CardText text={display.originalDescription} auxiliary />}
      </div>
    );
  return (
    <p className="text-xs text-muted-foreground/60">
      未抓取描述 ·{" "}
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshingMetadata}
        className="underline underline-offset-2"
      >
        {isRefreshingMetadata ? "抓取中..." : "点击抓取"}
      </button>
    </p>
  );
}
