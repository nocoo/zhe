"use client";

import Image from "next/image";
import { Check, Copy, Link2 } from "lucide-react";
import type { Link } from "@/models/types";

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
        className={`${cls} shrink-0 rounded-sm`}
        unoptimized
        onError={onError}
      />
    );
  }
  return (
    <div
      className={`${cls} shrink-0 rounded-sm bg-accent flex items-center justify-center`}
    >
      <Link2
        className={`${iconCls} text-muted-foreground/60`}
        strokeWidth={2}
      />
    </div>
  );
}

/** Inline anchor that renders `note | titleText` when a note is present. */
function TitleAnchor({
  href,
  note,
  titleText,
}: {
  href: string;
  note: string | null;
  titleText: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-foreground hover:underline truncate"
    >
      {note ? (
        <>
          <span>{note}</span>
          <span className="mx-1.5 text-border">|</span>
          <span className="text-muted-foreground">{titleText}</span>
        </>
      ) : (
        titleText
      )}
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
}: TitleRowProps) {
  const rowCls =
    variant === "grid"
      ? "flex items-center gap-1.5"
      : "flex items-center gap-2 mb-1";
  return (
    <div className={rowCls}>
      <Favicon
        link={link}
        show={showFaviconImage}
        onError={onFaviconError}
        size={variant === "grid" ? "sm" : "md"}
      />
      <TitleAnchor
        href={link.originalUrl}
        note={link.note}
        titleText={titleText}
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
  description,
  isRefreshingMetadata,
  onRefresh,
  variant,
}: {
  description: string | null;
  isRefreshingMetadata: boolean;
  onRefresh: () => void;
  variant: "grid" | "list";
}) {
  const baseCls = variant === "grid" ? "" : "mt-0.5";
  if (description) {
    return (
      <p
        className={`text-xs text-muted-foreground/70 truncate ${baseCls}`}
      >
        {description}
      </p>
    );
  }
  return (
    <p className={`text-xs text-muted-foreground/40 truncate ${baseCls}`}>
      未抓取描述 ·{" "}
      <button
        onClick={onRefresh}
        disabled={isRefreshingMetadata}
        className="hover:text-muted-foreground underline underline-offset-2 transition-colors"
      >
        {isRefreshingMetadata ? "抓取中..." : "点击抓取"}
      </button>
    </p>
  );
}
