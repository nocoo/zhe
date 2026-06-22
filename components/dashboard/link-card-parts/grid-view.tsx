"use client";

import Image from "next/image";
import {
  BarChart3,
  Camera,
  Check,
  Copy,
  ImageIcon,
  Link2,
  Loader2,
  Pencil,
} from "lucide-react";
import { TagBadge } from "@/components/dashboard/shared-link-components";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Link, Tag } from "@/models/types";
import { TitleRow, Description } from "./shared-rows";

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
}

function GridScreenshot({
  link,
  screenshotUrl,
  faviconUrl,
  isFetchingPreview,
  onOpenPreviewDialog,
  onToggleEdit,
}: Pick<
  GridViewProps,
  | "link"
  | "screenshotUrl"
  | "faviconUrl"
  | "isFetchingPreview"
  | "onOpenPreviewDialog"
  | "onToggleEdit"
>) {
  return (
    <div
      className="relative block w-full aspect-[4/3] bg-accent cursor-pointer"
      onClick={() =>
        window.open(link.originalUrl, "_blank", "noopener,noreferrer")
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.open(link.originalUrl, "_blank", "noopener,noreferrer");
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`打开链接 ${link.originalUrl}`}
    >
      {screenshotUrl ? (
        <Image
          src={screenshotUrl}
          alt="Screenshot"
          fill
          className="object-cover"
          unoptimized
        />
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
          <ImageIcon
            className="w-5 h-5 text-muted-foreground/40"
            strokeWidth={1.5}
          />
        </div>
      )}

      {/* Action overlay.
          Desktop (hover): full dim overlay revealed on hover/focus-within.
          Touch (hover:none): a small top-right floating cluster that is
          always visible so actions remain reachable without hover. */}
      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:inset-auto [@media(hover:none)]:right-1 [@media(hover:none)]:top-1 [@media(hover:none)]:gap-0.5 [@media(hover:none)]:bg-transparent [@media(hover:none)]:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenPreviewDialog();
          }}
          disabled={isFetchingPreview}
          aria-label="Refresh preview"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/20 hover:text-white [@media(hover:none)]:bg-black/40 [@media(hover:none)]:backdrop-blur-sm"
          title="刷新预览图"
        >
          {isFetchingPreview ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <Camera className="w-4 h-4" strokeWidth={1.5} />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleEdit();
          }}
          aria-label="Edit link"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/20 hover:text-white [@media(hover:none)]:bg-black/40 [@media(hover:none)]:backdrop-blur-sm"
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
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
      <span className="flex items-center gap-1">
        <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
        <span data-testid="click-count">
          {formatNumber(link.clicks ?? 0)}
        </span>{" "}
        次点击
      </span>
      <span>{formatDate(link.createdAt)}</span>
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
        />
        <Description
          description={link.metaDescription ?? null}
          isRefreshingMetadata={isRefreshingMetadata}
          onRefresh={onRefreshMetadata}
          variant="grid"
        />
        <GridMetaRow
          link={link}
          shortUrl={shortUrl}
          copied={copied}
          onCopy={onCopy}
        />
        {cardTags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {cardTags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} size="sm" />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
