"use client";

import { Link2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { linkPresentation } from "@/models/link-presentation";
import type { Link } from "@/models/types";
import { CardTitleText } from "./curated-text";

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
}: {
  href: string;
  title: string | null;
  titleText: string;
}) {
  const content = (
    <CardTitleText
      title={title?.trim() || titleText}
      original={title?.trim() && title.trim() !== titleText ? titleText : ""}
    />
  );
  const className =
    "min-w-0 truncate text-left text-sm font-medium leading-5 text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  );
}

export interface LinkPreviewProps {
  link: Link;
  titleText: string;
  showFaviconImage: boolean;
  shortUrl: string;
  screenshotUrl: string | null;
  faviconUrl: string | null;
  onFaviconError: () => void;
  onOpenDetails?: (() => void) | undefined;
}

export function TitleRow({
  link,
  titleText,
  showFaviconImage,
  onFaviconError,
}: Pick<LinkPreviewProps, "link" | "titleText" | "showFaviconImage" | "onFaviconError">) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Favicon link={link} show={showFaviconImage} onError={onFaviconError} size="sm" />
      <TitleAnchor href={link.originalUrl} title={link.title} titleText={titleText} />
    </div>
  );
}

export function SourceLinks({ link, shortUrl }: { link: Link; shortUrl: string }) {
  return (
    <div
      className="flex h-5 min-w-0 items-center gap-2 text-xs text-muted-foreground"
      data-bookmark-links
    >
      <a
        href={link.originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 truncate hover:text-foreground"
        title={link.originalUrl}
      >
        {new URL(link.originalUrl).hostname}
      </a>
      <span aria-hidden>·</span>
      <a
        href={shortUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 truncate hover:text-foreground"
        title={shortUrl}
      >
        /{link.slug}
      </a>
      {link.expiresAt && (
        <span
          className="shrink-0 text-warning"
          title={new Date(link.expiresAt).toLocaleString("zh-CN")}
        >
          限时
        </span>
      )}
    </div>
  );
}

export function Description({ link }: { link: Link }) {
  const display = linkPresentation(link);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-10 w-full items-start justify-start overflow-hidden p-0 text-left text-sm font-normal leading-5 hover:bg-transparent"
          aria-label="查看收藏内容"
        >
          <span className="line-clamp-2 whitespace-pre-wrap break-words">
            {display.description || "暂无描述"}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent size="lg" className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{display.title}</DialogTitle>
          <DialogDescription>收藏内容</DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap break-words text-sm">
          {display.description || "暂无描述"}
        </p>
        {display.originalDescription && (
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {display.originalDescription}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
