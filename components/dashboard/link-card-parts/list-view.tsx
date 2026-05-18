"use client";

import Image from "next/image";
import {
  BarChart3,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ImageIcon,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { TagBadge } from "@/components/dashboard/shared-link-components";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Link, Tag } from "@/models/types";
import { TitleRow, Description } from "./shared-rows";

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
  isEditing: boolean;
  isFetchingPreview: boolean;
  isRefreshingMetadata: boolean;
  showAnalytics: boolean;
  onFaviconError: () => void;
  onCopy: () => void;
  onCopyOriginalUrl: () => void;
  onOpenPreviewDialog: () => void;
  onToggleEdit: () => void;
  onToggleAnalytics: () => void;
  onRefreshMetadata: () => void;
}

function ListThumbnail({
  link,
  screenshotUrl,
  faviconUrl,
}: Pick<ListViewProps, "link" | "screenshotUrl" | "faviconUrl">) {
  return (
    <div className="group/thumb relative shrink-0 hidden sm:flex w-[118px] h-[62px] rounded-md border border-border/50 bg-accent items-center justify-center overflow-hidden">
      {screenshotUrl ? (
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
            className="w-10 h-10 object-contain"
            unoptimized
          />
        </div>
      ) : (
        <ImageIcon
          className="w-5 h-5 text-muted-foreground/40"
          strokeWidth={1.5}
        />
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
        onClick={onToggleAnalytics}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
        <span>
          <span data-testid="click-count">
            {formatNumber(link.clicks ?? 0)}
          </span>{" "}
          次点击
        </span>
        {showAnalytics ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
      <span>{formatDate(link.createdAt)}</span>
      {link.expiresAt && (
        <span className="text-destructive">
          过期: {formatDate(link.expiresAt)}
        </span>
      )}
      {cardTags.map((tag) => (
        <TagBadge key={tag.id} tag={tag} size="sm" />
      ))}
    </div>
  );
}

function ListActions({
  isEditing,
  isFetchingPreview,
  isRefreshingMetadata,
  onRefreshMetadata,
  onOpenPreviewDialog,
  onToggleEdit,
}: {
  isEditing: boolean;
  isFetchingPreview: boolean;
  isRefreshingMetadata: boolean;
  onRefreshMetadata: () => void;
  onOpenPreviewDialog: () => void;
  onToggleEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
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
      <button
        onClick={onOpenPreviewDialog}
        disabled={isFetchingPreview}
        aria-label="Refresh preview"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="刷新预览图"
      >
        {isFetchingPreview ? (
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
        ) : (
          <Camera className="w-4 h-4" strokeWidth={1.5} />
        )}
      </button>
      <button
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
    isFetchingPreview,
    isRefreshingMetadata,
    showAnalytics,
    onFaviconError,
    onCopy,
    onCopyOriginalUrl,
    onOpenPreviewDialog,
    onToggleEdit,
    onToggleAnalytics,
    onRefreshMetadata,
  } = props;

  return (
    <div className="flex items-stretch gap-4">
      <ListThumbnail
        link={link}
        screenshotUrl={props.screenshotUrl}
        faviconUrl={props.faviconUrl}
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
        />
        <Description
          description={link.metaDescription ?? null}
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
        isEditing={isEditing}
        isFetchingPreview={isFetchingPreview}
        isRefreshingMetadata={isRefreshingMetadata}
        onRefreshMetadata={onRefreshMetadata}
        onOpenPreviewDialog={onOpenPreviewDialog}
        onToggleEdit={onToggleEdit}
      />
    </div>
  );
}
