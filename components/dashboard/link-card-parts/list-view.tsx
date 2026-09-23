"use client";

import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ImageIcon,
  ImageOff,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
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
import { XBookmarkDetailsButton } from "../x-bookmark-content";
import { Description, TitleRow } from "./shared-rows";

interface ListViewProps {
  link: Link;
  titleText: string;
  showFaviconImage: boolean;
  shortUrl: string;
  screenshotUrl: string | null;
  faviconUrl: string | null;
  cardTags: Tag[];
  copied: boolean;
  copiedOriginalUrl: boolean;
  visibilityAction?: React.ReactNode;
  isEditing: boolean;
  canDeleteScreenshot: boolean;
  isDeletingScreenshot: boolean;
  isRefreshingMetadata: boolean;
  showAnalytics: boolean;
  onFaviconError: () => void;
  onCopy: () => void;
  onCopyOriginalUrl: () => void;
  onDeleteScreenshot: () => void;
  onToggleEdit: () => void;
  onToggleAnalytics: () => void;
  onRefreshMetadata: () => void;
  onSuggest?: () => void;
  suggestDisabled?: boolean;
  onOpenDetails?: (() => void) | undefined;
  xBookmark?: XBookmark | undefined;
}

function ListThumbnail({
  link,
  screenshotUrl,
  faviconUrl,
  onOpenDetails,
}: Pick<ListViewProps, "link" | "screenshotUrl" | "faviconUrl" | "onOpenDetails">) {
  return (
    <div className="group/thumb relative shrink-0 hidden sm:flex w-[118px] h-[62px] rounded-md border border-border/50 bg-accent items-center justify-center overflow-hidden">
      {onOpenDetails ? (
        <button
          type="button"
          className="flex h-full w-full items-center justify-center"
          onClick={onOpenDetails}
          aria-label="查看 X 帖子"
        >
          {screenshotUrl ? (
            <Image
              src={screenshotUrl}
              alt="X 帖子预览"
              width={118}
              height={62}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <XIcon className="size-7 text-foreground/60" />
          )}
        </button>
      ) : screenshotUrl ? (
        <a
          href={link.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full h-full"
        >
          <Image
            src={screenshotUrl}
            alt="Screenshot"
            width={118}
            height={62}
            className="w-full h-full object-cover object-top"
            unoptimized
          />
        </a>
      ) : faviconUrl ? (
        <div className="flex items-center justify-center w-full h-full">
          <Image
            src={faviconUrl}
            alt="Site favicon"
            width={40}
            height={40}
            className="w-10 h-10 box-content rounded-widget bg-white p-1.5 object-contain scheme-light"
            unoptimized
          />
        </div>
      ) : (
        <ImageIcon className="w-5 h-5 text-muted-foreground/40" strokeWidth={1.5} />
      )}
    </div>
  );
}

function ListMetaRow({
  link,
  shortUrl,
  copied,
  showAnalytics,
  cardTags,
  onCopy,
  onToggleAnalytics,
}: {
  link: Link;
  shortUrl: string;
  copied: boolean;
  showAnalytics: boolean;
  cardTags: Tag[];
  onCopy: () => void;
  onToggleAnalytics: () => void;
}) {
  return (
    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
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
      <button
        type="button"
        onClick={onToggleAnalytics}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
        <span>
          <span data-testid="click-count">{formatNumber(link.clicks ?? 0)}</span> 次点击
        </span>
        {showAnalytics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      <span>{formatDate(link.createdAt)}</span>
      {link.expiresAt && (
        <span className="text-destructive">过期: {formatDate(link.expiresAt)}</span>
      )}
      {cardTags.map((tag) => (
        <TagBadge key={tag.id} tag={tag} size="sm" />
      ))}
    </div>
  );
}

function ListActions({
  visibilityAction,
  isEditing,
  canDeleteScreenshot,
  isDeletingScreenshot,
  isRefreshingMetadata,
  onRefreshMetadata,
  onDeleteScreenshot,
  onToggleEdit,
  onSuggest,
  suggestDisabled,
  onOpenDetails,
  xBookmark,
}: {
  visibilityAction?: React.ReactNode;
  isEditing: boolean;
  canDeleteScreenshot: boolean;
  isDeletingScreenshot: boolean;
  isRefreshingMetadata: boolean;
  onRefreshMetadata: () => void;
  onDeleteScreenshot: () => void;
  onToggleEdit: () => void;
  onSuggest?: () => void;
  suggestDisabled?: boolean;
  onOpenDetails?: (() => void) | undefined;
  xBookmark?: XBookmark | undefined;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {visibilityAction}
      {onOpenDetails ? (
        <XBookmarkDetailsButton bookmark={xBookmark} onClick={onOpenDetails} />
      ) : (
        <>
          <button
            type="button"
            onClick={onRefreshMetadata}
            disabled={isRefreshingMetadata}
            aria-label="Refresh metadata"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="刷新元数据"
          >
            {isRefreshingMetadata ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
          {canDeleteScreenshot && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onDeleteScreenshot}
              disabled={isDeletingScreenshot}
              aria-label="删除截图"
              className="text-muted-foreground hover:text-destructive"
              title="删除截图"
            >
              {isDeletingScreenshot ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <ImageOff className="w-4 h-4" strokeWidth={1.5} />
              )}
            </Button>
          )}
        </>
      )}
      {onSuggest && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={onSuggest}
                  disabled={suggestDisabled}
                  aria-label="AI 整理"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Sparkles strokeWidth={1.5} />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{suggestDisabled ? "请先在设置中配置 AI" : "AI 整理"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <button
        type="button"
        onClick={onToggleEdit}
        aria-label="Edit link"
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          isEditing
            ? "text-foreground bg-accent"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        title="Edit link"
      >
        <Pencil className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function ListView(props: ListViewProps) {
  const {
    link,
    titleText,
    showFaviconImage,
    shortUrl,
    cardTags,
    copied,
    copiedOriginalUrl,
    isEditing,
    canDeleteScreenshot,
    isDeletingScreenshot,
    isRefreshingMetadata,
    showAnalytics,
    onFaviconError,
    onCopy,
    onCopyOriginalUrl,
    onDeleteScreenshot,
    onToggleEdit,
    onToggleAnalytics,
    onRefreshMetadata,
    onSuggest,
    suggestDisabled,
  } = props;

  return (
    <div className="flex items-stretch gap-4">
      <ListThumbnail
        link={link}
        screenshotUrl={props.screenshotUrl}
        faviconUrl={props.faviconUrl}
        onOpenDetails={props.onOpenDetails}
      />

      <div className="flex-1 min-w-0">
        <TitleRow
          link={link}
          titleText={titleText}
          showFaviconImage={showFaviconImage}
          copiedOriginalUrl={copiedOriginalUrl}
          onFaviconError={onFaviconError}
          onCopyOriginalUrl={onCopyOriginalUrl}
          variant="list"
          onOpenDetails={props.onOpenDetails}
        />
        <Description
          link={link}
          isRefreshingMetadata={isRefreshingMetadata}
          onRefresh={onRefreshMetadata}
          variant="list"
        />
        <ListMetaRow
          link={link}
          shortUrl={shortUrl}
          copied={copied}
          showAnalytics={showAnalytics}
          cardTags={cardTags}
          onCopy={onCopy}
          onToggleAnalytics={onToggleAnalytics}
        />
      </div>

      <ListActions
        visibilityAction={props.visibilityAction}
        isEditing={isEditing}
        canDeleteScreenshot={canDeleteScreenshot}
        isDeletingScreenshot={isDeletingScreenshot}
        isRefreshingMetadata={isRefreshingMetadata}
        onRefreshMetadata={onRefreshMetadata}
        onDeleteScreenshot={onDeleteScreenshot}
        onToggleEdit={onToggleEdit}
        onOpenDetails={props.onOpenDetails}
        xBookmark={props.xBookmark}
        {...(onSuggest ? { onSuggest } : {})}
        {...(suggestDisabled !== undefined ? { suggestDisabled } : {})}
      />
    </div>
  );
}
