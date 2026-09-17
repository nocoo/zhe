"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  LayerCard,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nocoo/basalt";
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Check,
  CircleAlert,
  Clock3,
  Eye,
  FileText,
  Heart,
  ImageOff,
  Link2,
  MessageCircle,
  Play,
  Quote as QuoteIcon,
  RefreshCw,
  Repeat2,
} from "lucide-react";
import { useState } from "react";
import { retryXBookmarkAction } from "@/actions/connector";
import { videoFileSize, videoResolution, type XMedia, type XPost } from "@/cli/src/connector/core";
import { XIcon } from "@/components/x-icon";
import type { XBookmark } from "@/lib/connector/jobs";
import { cn } from "@/lib/utils";
import { linkPresentation } from "@/models/link-presentation";
import type { Link } from "@/models/types";
import {
  getXContentTypes,
  getXPostPresentation,
  X_CONTENT_TYPES,
  type XContentType,
  xMediaFailureMessage,
} from "@/models/x-bookmarks";
import { formatCount, formatTweetDate } from "@/models/xray";
import { useGifPlayback } from "@/viewmodels/useGifPlayback";
import { CardText, CardTitleText } from "./link-card-parts/curated-text";

const statusLabels = {
  pending: "等待补全",
  running: "正在补全",
  complete: "已补全",
  partial: "正文已保存，媒体待补全",
  failed: "补全暂未完成",
  unavailable: "原帖暂不可访问",
};

export function XBookmarkDetailsButton({
  bookmark,
  onClick,
  className,
}: {
  bookmark: XBookmark | undefined;
  onClick: () => void;
  className?: string;
}) {
  const state = bookmark?.state ?? "pending";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClick}
            aria-label="查看帖子详情"
            aria-description={statusLabels[state]}
            className={cn("relative text-muted-foreground hover:text-foreground", className)}
          >
            <BookOpen strokeWidth={1.5} aria-hidden />
            {state !== "complete" && (
              <span
                aria-hidden
                className={cn(
                  "absolute right-1.5 top-1.5 size-1.5 rounded-full bg-muted-foreground",
                  state === "running" && "bg-primary animate-pulse motion-reduce:animate-none",
                  ["partial", "failed", "unavailable"].includes(state) && "bg-warning",
                )}
              />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>查看帖子详情 · {statusLabels[state]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function XSourceBadge({
  type = "text",
  compact = false,
}: {
  type?: XContentType;
  compact?: boolean;
}) {
  return (
    <span
      title="来源：X"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-widget bg-foreground text-background",
        compact ? "p-1.5" : "px-2 py-1.5",
      )}
    >
      <XIcon className="size-3.5" />
      <span className="sr-only">X · </span>
      <span
        className={
          compact
            ? "sr-only"
            : "border-l border-background/25 pl-2 text-[11px] font-medium leading-none"
        }
      >
        {X_CONTENT_TYPES.find((item) => item.value === type)?.label}
      </span>
    </span>
  );
}

function PostText({ text, compact = false }: { text: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = text.length > 600;
  return (
    <div>
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-sm text-foreground",
          compact ? "line-clamp-3 leading-5" : "leading-6",
          !compact && collapsible && !expanded && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {!compact && collapsible && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="-ml-2 mt-1 text-primary"
        >
          {expanded ? "收起全文" : "展开全文"}
        </Button>
      )}
    </div>
  );
}

function PostMedia({
  media,
  index,
  compact = false,
  autoPlay = false,
  onPlay,
}: {
  media: XMedia;
  index: number;
  compact?: boolean;
  autoPlay?: boolean;
  onPlay?: (() => void) | undefined;
}) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(autoPlay);
  const [posterFailed, setPosterFailed] = useState(false);
  const videoRef = useGifPlayback(media.type === "GIF" ? media.url : null, failed);
  // Stored dimensions include manual corrections. Older captures default to
  // landscape without loading a player or probing media metadata.
  const aspectRatio = media.width && media.height ? `${media.width}/${media.height}` : "16/9";
  const mediaBadge = (
    <span
      data-testid="x-media-type-badge"
      className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
    >
      {media.type === "GIF" ? "GIF" : "视频"}
      {!!media.duration &&
        ` · ${Math.floor(media.duration / 60)}:${String(Math.floor(media.duration % 60)).padStart(2, "0")}`}
    </span>
  );
  if (failed)
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-widget border border-dashed border-border bg-background/60 p-3 text-muted-foreground">
        <ImageOff className="size-6" strokeWidth={1.5} aria-hidden />
        <span role="status" className="text-xs">
          {media.type === "PHOTO" ? "图片暂时无法加载" : "媒体暂时无法播放"}
        </span>
        <Button size="sm" variant="outline" onClick={() => setFailed(false)}>
          重试
        </Button>
      </div>
    );
  if (media.type === "VIDEO" && !playing)
    return (
      <Button
        variant="ghost"
        className="group/media relative block h-auto w-full overflow-hidden rounded-widget border border-border/60 bg-accent p-0 hover:bg-accent"
        aria-label={`播放视频 ${index + 1}`}
        aria-haspopup={onPlay ? "dialog" : undefined}
        onClick={onPlay ?? (() => setPlaying(true))}
      >
        {media.thumbnail_url && !posterFailed ? (
          <img
            src={media.thumbnail_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="block h-auto w-full object-contain"
            style={{ aspectRatio }}
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <span
            className="relative block w-full overflow-hidden bg-linear-to-br from-secondary to-accent"
            style={{ aspectRatio }}
          >
            <XIcon
              className="absolute -bottom-3 -right-3 size-28 text-foreground/[0.06]"
              aria-hidden
            />
          </span>
        )}
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <span className="flex size-10 items-center justify-center rounded-widget border border-white/30 bg-black/45 text-white shadow-sm backdrop-blur-sm transition-colors group-hover/media:bg-black/65">
            <Play className="size-4 fill-current" />
          </span>
        </span>
        {mediaBadge}
      </Button>
    );
  if (media.type !== "PHOTO")
    return (
      <div className="relative overflow-hidden rounded-widget border border-border/60 bg-black">
        <video
          ref={videoRef}
          src={media.type === "GIF" ? undefined : media.url}
          poster={media.thumbnail_url}
          controls
          autoPlay
          playsInline
          loop={media.type === "GIF"}
          muted={media.type === "GIF"}
          preload="none"
          aria-label={media.type === "GIF" ? "已归档的 X GIF" : "已归档的 X 视频"}
          className={cn(
            "mx-auto block w-full object-contain",
            compact ? "max-h-64" : "max-h-[32rem]",
          )}
          style={{ aspectRatio }}
          onError={() => setFailed(true)}
        >
          <track kind="captions" />
        </video>
        {mediaBadge}
      </div>
    );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="block h-auto w-full overflow-hidden rounded-widget border border-border/60 bg-background/60 p-0"
          aria-label={`查看图片 ${index + 1}`}
        >
          <img
            src={media.url}
            alt={`帖子图片 ${index + 1}`}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full object-contain transition-opacity hover:opacity-90"
            style={{ aspectRatio }}
            onError={() => setFailed(true)}
          />
        </Button>
      </DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>图片预览</DialogTitle>
          <DialogDescription>已保存到您的 Zhe 存储</DialogDescription>
        </DialogHeader>
        <img
          src={media.url}
          alt={`帖子图片 ${index + 1}`}
          className="max-h-[75dvh] w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}

function MediaGrid({
  media,
  compact = false,
  playMediaId,
  onPlayMedia,
}: {
  media: XMedia[];
  compact?: boolean;
  playMediaId?: string | undefined;
  onPlayMedia?: ((id: string) => void) | undefined;
}) {
  if (!media.length) return null;
  const collage = media.length > 1 && media.every((item) => item.type === "PHOTO");
  const visible = compact ? media.slice(0, collage ? 4 : 1) : media;
  return (
    <div
      className={cn("relative", collage ? "columns-2 gap-1 space-y-1" : "grid gap-2")}
      data-testid="x-media-grid"
    >
      {visible.map((item, index) => (
        <div
          key={`${item.id}:${item.url}:${item.thumbnail_url ?? ""}`}
          className="min-h-0 min-w-0 break-inside-avoid"
        >
          <PostMedia
            media={item}
            index={index}
            compact={compact}
            autoPlay={item.id === playMediaId}
            onPlay={onPlayMedia ? () => onPlayMedia(item.id) : undefined}
          />
        </div>
      ))}
      {visible.length < media.length && (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white">
          {media.length} 个附件
        </span>
      )}
    </div>
  );
}

function PostLinks({
  links,
  headline,
  compact = false,
}: {
  links: ReturnType<typeof getXPostPresentation>["links"];
  headline?: string | null;
  compact?: boolean;
}) {
  if (!links.length) return null;
  return (
    <div className="space-y-2">
      {(compact ? links.slice(0, 1) : links).map(({ url, hostname, isXArticle, isArticle }) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={url}
          className={cn(
            "group/article relative block overflow-hidden rounded-widget border border-border/70 bg-background/60 text-foreground transition-colors hover:border-primary/30 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "p-3" : "p-4",
          )}
          data-testid="x-link-preview"
        >
          {isXArticle && (
            <XIcon className="pointer-events-none absolute -right-3 -top-3 size-28 text-foreground/[0.035]" />
          )}
          <div className="relative space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              {isArticle ? (
                <FileText className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              ) : (
                <Link2 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              )}
              {isXArticle ? "X 文章" : "分享链接"}
            </div>
            <p
              className={cn(
                "break-words font-medium leading-5",
                compact ? "line-clamp-2 text-sm" : "text-base",
              )}
            >
              {headline || (isXArticle ? "阅读 X 文章" : hostname)}
            </p>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">
                {headline || isXArticle
                  ? hostname
                  : new URL(url).pathname === "/"
                    ? "外部网站"
                    : new URL(url).pathname}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground group-hover/article:text-primary">
                {!compact && (isArticle ? "阅读全文" : "打开链接")}
                <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden />
              </span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function Quote({ tweet, compact = false }: { tweet: XPost; compact?: boolean }) {
  const { text, links } = getXPostPresentation(tweet);
  return (
    <blockquote
      aria-label="引用的 X 帖子"
      className={cn(
        "min-w-0 space-y-2 rounded-widget border border-border/70 bg-background/40",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Avatar className="size-6">
          <AvatarImage src={tweet.author.profile_image_url} alt="" />
          <AvatarFallback>{tweet.author.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <a
          href={tweet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate text-xs font-semibold hover:underline"
        >
          {tweet.author.name}{" "}
          <span className="font-normal text-muted-foreground">@{tweet.author.username}</span>
        </a>
        <QuoteIcon
          className="ml-auto size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-label="引用"
        />
      </div>
      {text && <PostText text={text} compact={compact} />}
      {!compact && <PostLinks links={links} />}
    </blockquote>
  );
}

export function XBookmarkContent({
  bookmark,
  note,
  title,
  originalTitle,
  compact = false,
  playMediaId,
  onPlayMedia,
}: {
  bookmark: XBookmark;
  note?: string | null;
  title?: string | null;
  originalTitle?: string | null;
  compact?: boolean;
  playMediaId?: string | undefined;
  onPlayMedia?: ((id: string) => void) | undefined;
}) {
  const tweet = bookmark.tweet;
  if (!tweet) return null;
  const { text, links } = getXPostPresentation(tweet);
  const standaloneLink = !text && links.length === 1;
  const authorTitle = `${tweet.author.name} (@${tweet.author.username})`;
  const display = linkPresentation({
    title: title ?? null,
    note: note ?? null,
    metaTitle: originalTitle || authorTitle,
    metaDescription: text,
    originalUrl: tweet.url,
  });
  const rawHeadline = originalTitle?.trim();
  const headline = rawHeadline && rawHeadline !== authorTitle ? rawHeadline : null;
  const date = formatTweetDate(tweet.created_at);
  const metrics = [
    { icon: Heart, label: "喜欢", count: tweet.metrics.like_count },
    { icon: Repeat2, label: "转帖", count: tweet.metrics.retweet_count },
    { icon: MessageCircle, label: "回复", count: tweet.metrics.reply_count },
    { icon: Eye, label: "浏览", count: tweet.metrics.view_count },
  ];
  return (
    <LayerCard.Body
      className={compact ? "space-y-2.5 p-3" : "space-y-3 p-5"}
      data-testid="x-bookmark-content"
    >
      {title?.trim() && (
        <div className="min-w-0 text-sm font-semibold">
          <CardTitleText title={display.title} />
        </div>
      )}
      <div className={cn("flex items-center", compact ? "gap-2" : "gap-2.5")}>
        <Avatar className={cn("shrink-0 ring-1 ring-border/60", compact && "size-7")}>
          <AvatarImage src={tweet.author.profile_image_url} alt={tweet.author.name} />
          <AvatarFallback>{tweet.author.name.slice(0, 1) || "X"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <a
              href={`https://x.com/${tweet.author.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-sm font-semibold hover:underline"
            >
              {tweet.author.name}
            </a>
            {tweet.author.is_verified && (
              <BadgeCheck
                className="size-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-label="认证账号"
              />
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">@{tweet.author.username}</span>
            {!compact && (
              <>
                <span aria-hidden>·</span>
                <time dateTime={tweet.created_at} title={date} className="shrink-0">
                  {date.split(" ")[0]}
                </time>
              </>
            )}
          </div>
        </div>
        <XSourceBadge type={getXContentTypes(tweet)[0] ?? "text"} compact={compact} />
      </div>
      <CardText text={display.note} code />
      {text && <PostText key={tweet.id} text={text} compact={compact} />}
      <MediaGrid
        media={tweet.media}
        compact={compact}
        playMediaId={playMediaId}
        onPlayMedia={onPlayMedia}
      />
      {(tweet.media.some((media) => media.type !== "PHOTO" && media.size) ||
        bookmark.mediaErrors?.length) && (
        <div
          className="space-y-1.5 text-xs leading-5 text-muted-foreground"
          data-testid="x-video-archive-info"
        >
          {tweet.media
            .filter((media) => media.type !== "PHOTO" && media.size)
            .map((media) => (
              <p key={media.id} className="flex flex-wrap items-center gap-x-2 tabular-nums">
                <span>已归档</span>
                {media.resolution || (media.width && media.height) ? (
                  <span>
                    {media.resolution || videoResolution(media.width ?? 0, media.height ?? 0)}
                  </span>
                ) : null}
                <span>{videoFileSize(media.size ?? 0)}</span>
              </p>
            ))}
          {bookmark.mediaErrors?.map((error) => (
            <p key={error.mediaId} className="break-words text-warning" role="status">
              {xMediaFailureMessage(error.code, error.attempts, error.type)}
            </p>
          ))}
        </div>
      )}
      <PostLinks links={links} headline={standaloneLink ? headline : null} compact={compact} />
      {tweet.quoted_tweet && (!compact || !tweet.media.length) && (
        <Quote tweet={tweet.quoted_tweet} compact={compact} />
      )}
      {!compact && (
        <section
          className="border-t border-border/60 pt-3 text-xs text-muted-foreground"
          aria-label="帖子统计"
        >
          <div className="grid grid-cols-4 gap-2">
            {metrics.map(({ icon: Icon, label, count }) => (
              <span
                key={label}
                title={`${label} ${count}`}
                className="inline-flex items-center justify-center gap-1.5 tabular-nums first:justify-start last:justify-end"
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                <span aria-hidden className="font-medium">
                  {formatCount(count)}
                </span>
                <span className="sr-only">
                  {label} {count}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}
    </LayerCard.Body>
  );
}

export function XBookmarkPending({ link, compact = false }: { link: Link; compact?: boolean }) {
  const display = linkPresentation(link);
  return (
    <LayerCard.Body className={compact ? "space-y-2.5 p-3" : "space-y-3 p-5"}>
      <div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground",
            compact ? "size-7" : "size-9",
          )}
        >
          <Clock3 className="size-4" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">已保存的 X 帖子</p>
          <p className="text-xs text-muted-foreground">内容暂未补全</p>
        </div>
        <XSourceBadge type="pending" compact={compact} />
      </div>
      {(link.title || link.metaTitle) && (
        <div className="text-sm font-medium">
          <CardTitleText title={display.title} original={display.originalTitle} />
        </div>
      )}
      <CardText text={display.note} code />
      <p
        className={cn(
          "text-sm text-muted-foreground",
          compact
            ? "line-clamp-3 leading-5"
            : "rounded-widget border border-dashed border-border bg-background/40 p-4 leading-6",
        )}
      >
        {link.metaDescription || "帖子内容尚未补全，可以先打开原帖查看。"}
      </p>
    </LayerCard.Body>
  );
}

export function XBookmarkStatus({
  bookmark,
  linkId,
  compact = false,
}: {
  bookmark: XBookmark | undefined;
  linkId: number;
  compact?: boolean;
}) {
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<{ version: string; success: boolean } | null>(null);
  const state = bookmark?.state ?? "pending";
  const version = `${linkId}:${state}:${bookmark?.updatedAt ?? 0}`;
  const currentFeedback = feedback?.version === version ? feedback : null;
  const errorMessage =
    bookmark?.errorCode && !bookmark.mediaErrors?.length
      ? xMediaFailureMessage(bookmark.errorCode)
      : undefined;
  const StatusIcon =
    state === "running"
      ? RefreshCw
      : state === "complete"
        ? Check
        : state === "pending"
          ? Clock3
          : CircleAlert;
  const icon = (
    <StatusIcon
      className={cn(
        "size-3.5 shrink-0",
        state === "complete" && "text-success",
        state === "running" && "animate-spin motion-reduce:animate-none",
        ["partial", "failed", "unavailable"].includes(state) && "text-warning",
      )}
      strokeWidth={1.5}
      aria-hidden
    />
  );
  if (compact)
    return (
      <span
        role="status"
        title={errorMessage ?? statusLabels[state]}
        className="inline-flex min-w-0 max-w-full items-center gap-1.5 truncate text-xs text-muted-foreground"
      >
        {icon}
        <span className="truncate">
          {errorMessage ?? (state === "partial" ? "媒体待补全" : statusLabels[state])}
        </span>
      </span>
    );
  const retry = async () => {
    setRetrying(true);
    try {
      setFeedback({ version, success: (await retryXBookmarkAction(linkId)).success });
    } catch {
      setFeedback({ version, success: false });
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
      {icon}
      <span>
        {currentFeedback
          ? currentFeedback.success
            ? "已重新排队"
            : "暂时无法重试"
          : statusLabels[state]}
      </span>
      {errorMessage &&
        ["failed", "partial", "unavailable"].includes(state) &&
        !currentFeedback?.success && (
          <span className="basis-full text-warning">{errorMessage}</span>
        )}
      {["failed", "partial", "unavailable"].includes(state) && !currentFeedback?.success && (
        <Button size="sm" variant="ghost" onClick={retry} disabled={retrying}>
          重新补全
        </Button>
      )}
    </div>
  );
}
