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
import type { XBookmark } from "@/lib/connector/jobs";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Link, Tag } from "@/models/types";
import { XBookmarkStatus } from "../x-bookmark-content";
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
    <div className="relative block w-full aspect-[4/3] bg-accent">
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-pointer border-0 bg-transparent p-0"
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
          <span
            className="absolute inset-0 flex items-center justify-center text-5xl font-semibold text-muted-foreground/30"
            aria-hidden
          >
            X
          </span>
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
        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold">
          X
        </span>
      )}
      {media[0] && media[0].type !== "PHOTO" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="size-5 fill-current" aria-hidden />
          </span>
        </div>
      )}
      {onOpenDetails && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-2">
          <span className="min-w-0 rounded-full bg-background/90 px-2 py-0.5">
            <XBookmarkStatus bookmark={xBookmark} linkId={link.id} compact />
          </span>
          {media.length > 1 && (
            <span className="shrink-0 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {media.length} 个附件
            </span>
          )}
        </div>
      )}

      {/* Action overlay.
          Desktop (hover): full dim overlay revealed on hover/focus-within.
          Touch (hover:none): a small top-right floating cluster that is
          always visible so actions remain reachable without hover.
          Container is pointer-events-none so open-button still receives
          clicks; individual actions re-enable pointer events. */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:inset-auto [@media(hover:none)]:right-1 [@media(hover:none)]:top-1 [@media(hover:none)]:gap-0.5 [@media(hover:none)]:bg-transparent [@media(hover:none)]:opacity-100">
        {!onOpenDetails && (
          <button
            type="button"
            onClick={onOpenPreviewDialog}
            disabled={isFetchingPreview}
            aria-label="Refresh preview"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/20 hover:text-white [@media(hover:none)]:bg-black/40 [@media(hover:none)]:backdrop-blur-xs"
            title="刷新预览图"
          >
            {isFetchingPreview ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Camera className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
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
                    className="text-white/80 hover:bg-white/20 hover:text-white disabled:opacity-40 [@media(hover:none)]:bg-black/40 [@media(hover:none)]:backdrop-blur-xs"
                  >
                    <Sparkles strokeWidth={1.5} />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{suggestDisabled ? "请先在设置中配置 AI" : "AI 建议"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <button
          type="button"
          onClick={onToggleEdit}
          aria-label="Edit link"
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/20 hover:text-white [@media(hover:none)]:bg-black/40 [@media(hover:none)]:backdrop-blur-xs"
          title="Edit link"
        >
          <Pencil className="w-4 h-4" strokeWidth={1.5} />
        </button>
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
    <div className="flex h-4 min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
      <span className="flex shrink-0 items-center gap-1">
        <Link2 className="w-3 h-3" strokeWidth={1.5} />
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
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
      <span className="flex shrink-0 items-center gap-1">
        <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
        <span data-testid="click-count">{formatNumber(link.clicks ?? 0)}</span> 次点击
      </span>
      <span className="ml-auto truncate" title={formatDate(link.createdAt)}>
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

      <div className="p-3 space-y-1">
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
