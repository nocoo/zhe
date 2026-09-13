"use client";

import {
  BarChart3,
  Camera,
  Check,
  Copy,
  ImageIcon,
  Link2,
  Loader2,
  Pencil,
  Play,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { TagBadge } from "@/components/dashboard/shared-link-components";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { XIcon } from "@/components/x-icon";
import type { XBookmark } from "@/lib/connector/jobs";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Link, Tag } from "@/models/types";
import { getXContentTypes } from "@/models/x-bookmarks";
import { XBookmarkStatus, XSourceBadge } from "../x-bookmark-content";
import { Description, TitleRow } from "./shared-rows";

interface GridViewProps {
  link: Link;
  titleText: string;
  showFaviconImage: boolean;
  shortUrl: string;
  screenshotUrl: string | null;
  faviconUrl: string | null;
  cardTags: Tag[];
  copied: boolean;
  copiedOriginalUrl: boolean;
  isFetchingPreview: boolean;
  isRefreshingMetadata: boolean;
  onFaviconError: () => void;
  onCopy: () => void;
  onCopyOriginalUrl: () => void;
  onOpenPreviewDialog: () => void;
  onToggleEdit: () => void;
  onRefreshMetadata: () => void;
  onSuggest?: () => void;
  suggestDisabled?: boolean;
  xBookmark?: XBookmark | undefined;
  onOpenDetails?: (() => void) | undefined;
}

function GridScreenshot({
  link,
  screenshotUrl,
  faviconUrl,
  isFetchingPreview,
  onOpenPreviewDialog,
  onToggleEdit,
  onSuggest,
  suggestDisabled,
  xBookmark,
  onOpenDetails,
}: Pick<
  GridViewProps,
  | "link"
  | "screenshotUrl"
  | "faviconUrl"
  | "isFetchingPreview"
  | "onOpenPreviewDialog"
  | "onToggleEdit"
  | "onSuggest"
  | "suggestDisabled"
  | "xBookmark"
  | "onOpenDetails"
>) {
  const openOriginal = () => {
    window.open(link.originalUrl, "_blank", "noopener,noreferrer");
  };
  const open = onOpenDetails ?? openOriginal;
  const media = xBookmark?.tweet?.media ?? [];

  return (
    // Full-bleed open control + sibling action buttons (no nested interactives).
    <div className="relative block w-full aspect-[4/3] border-b border-border/50 bg-background/60">
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        aria-label={onOpenDetails ? "查看 X 帖子" : `打开链接 ${link.originalUrl}`}
      />

      <div className="relative z-10 h-full w-full pointer-events-none">
        {screenshotUrl ? (
          <Image
            src={screenshotUrl}
            alt={onOpenDetails ? "X 帖子预览" : "Screenshot"}
            fill
            className="object-cover"
            unoptimized
          />
        ) : onOpenDetails ? (
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
            aria-hidden
          >
            <XIcon className="absolute -bottom-4 -right-4 size-36 text-foreground/[0.035]" />
            <XIcon className="size-12 text-foreground/60" />
          </div>
        ) : faviconUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Image
              src={faviconUrl}
              alt="Site favicon"
              width={48}
              height={48}
              className="w-12 h-12 object-contain"
              unoptimized
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-muted-foreground/40" strokeWidth={1.5} />
          </div>
        )}
      </div>

      {onOpenDetails && (
        <span className="pointer-events-none absolute left-3 top-3 z-10">
          <XSourceBadge type={getXContentTypes(xBookmark?.tweet)[0] ?? "pending"} />
        </span>
      )}
      {media[0] && media[0].type !== "PHOTO" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white shadow-sm backdrop-blur-sm">
            <Play className="size-5 fill-current" aria-hidden />
          </span>
        </div>
      )}
      {onOpenDetails && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-center justify-between gap-2">
          <span className="min-w-0 rounded-full border border-border/40 bg-secondary/95 px-2 py-1 backdrop-blur-sm">
            <XBookmarkStatus bookmark={xBookmark} linkId={link.id} compact />
          </span>
          {media.length > 1 && (
            <span className="shrink-0 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-[11px] text-white backdrop-blur-sm">
              {media.length} 个附件
            </span>
          )}
        </div>
      )}

      {/* Sibling actions stay clear of the preview and remain visible on touch. */}
      <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-widget bg-black/55 text-white opacity-0 shadow-xs backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        {!onOpenDetails && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onOpenPreviewDialog}
            disabled={isFetchingPreview}
            aria-label="Refresh preview"
            className="pointer-events-auto text-white/90 hover:bg-white/15 hover:text-white"
            title="刷新预览图"
          >
            {isFetchingPreview ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Camera className="w-4 h-4" strokeWidth={1.5} />
            )}
          </Button>
        )}
        {onSuggest && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="pointer-events-auto inline-flex">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onSuggest}
                    disabled={suggestDisabled}
                    aria-label="AI 建议"
                    className="text-white/90 hover:bg-white/15 hover:text-white disabled:opacity-40"
                  >
                    <Sparkles strokeWidth={1.5} />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{suggestDisabled ? "请先在设置中配置 AI" : "AI 建议"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onToggleEdit}
          aria-label="Edit link"
          className="pointer-events-auto text-white/90 hover:bg-white/15 hover:text-white"
          title="编辑收藏"
        >
          <Pencil className="w-4 h-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}

function GridMetaRow({
  link,
  shortUrl,
  copied,
  onCopy,
}: {
  link: Link;
  shortUrl: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex h-7 min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap border-t border-border/60 pt-2 text-xs text-muted-foreground">
      <span className="flex min-w-0 items-center gap-1">
        <Link2 className="w-3 h-3" strokeWidth={1.5} />
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate transition-colors hover:text-foreground"
        >
          {link.slug}
        </a>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy link"
          className="flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Copy link"
        >
          {copied ? (
            <Check className="w-2.5 h-2.5 text-success" strokeWidth={1.5} />
          ) : (
            <Copy className="w-2.5 h-2.5" strokeWidth={1.5} />
          )}
        </button>
      </span>
      <span
        className="ml-auto flex shrink-0 items-center gap-1"
        title={`${formatNumber(link.clicks ?? 0)} 次点击`}
      >
        <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
        <span data-testid="click-count">{formatNumber(link.clicks ?? 0)}</span>
        <span className="sr-only"> 次点击</span>
      </span>
      <span className="hidden shrink-0 @min-[16rem]:inline" title={formatDate(link.createdAt)}>
        {formatDate(link.createdAt)}
      </span>
    </div>
  );
}

export function GridView(props: GridViewProps) {
  const {
    link,
    titleText,
    showFaviconImage,
    shortUrl,
    cardTags,
    copied,
    copiedOriginalUrl,
    isRefreshingMetadata,
    onFaviconError,
    onCopy,
    onCopyOriginalUrl,
    onRefreshMetadata,
  } = props;

  return (
    <>
      <GridScreenshot
        link={link}
        screenshotUrl={props.screenshotUrl}
        faviconUrl={props.faviconUrl}
        isFetchingPreview={props.isFetchingPreview}
        onOpenPreviewDialog={props.onOpenPreviewDialog}
        onToggleEdit={props.onToggleEdit}
        xBookmark={props.xBookmark}
        onOpenDetails={props.onOpenDetails}
        {...(props.onSuggest ? { onSuggest: props.onSuggest } : {})}
        {...(props.suggestDisabled !== undefined ? { suggestDisabled: props.suggestDisabled } : {})}
      />

      <div className="space-y-2 p-4">
        <TitleRow
          link={link}
          titleText={titleText}
          showFaviconImage={showFaviconImage}
          copiedOriginalUrl={copiedOriginalUrl}
          onFaviconError={onFaviconError}
          onCopyOriginalUrl={onCopyOriginalUrl}
          variant="grid"
          stopPropagationOnCopy
          onOpenDetails={props.onOpenDetails}
        />
        <Description
          description={link.metaDescription ?? null}
          isRefreshingMetadata={isRefreshingMetadata}
          onRefresh={onRefreshMetadata}
          variant="grid"
        />
        <GridMetaRow link={link} shortUrl={shortUrl} copied={copied} onCopy={onCopy} />
        <div className="flex h-5 min-w-0 items-center gap-1 overflow-hidden [&>span]:max-w-24 [&>span]:truncate">
          {cardTags.slice(0, 2).map((tag) => (
            <TagBadge key={tag.id} tag={tag} size="sm" />
          ))}
          {cardTags.length > 2 && (
            <span
              className="shrink-0 text-xs text-muted-foreground"
              title={cardTags
                .slice(2)
                .map((tag) => tag.name)
                .join("、")}
            >
              +{cardTags.length - 2}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
