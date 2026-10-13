"use client";

import { Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Link } from "@/models/types";
import { getXContentTypes, getXPostPresentation } from "@/models/x-bookmarks";
import { SourceLinks } from "./link-card-parts/shared-rows";
import { XSourceBadge } from "./x-bookmark-content";

export function XBookmarkPreview({
  link,
  bookmark,
  shortUrl,
  onOpenDetails,
  onPlayMedia,
}: {
  link: Link;
  bookmark: XBookmark | undefined;
  shortUrl: string;
  onOpenDetails: () => void;
  onPlayMedia: (id: string) => void;
}) {
  const tweet = bookmark?.tweet;
  const media = tweet?.media[0];
  const image = media?.type === "PHOTO" ? media.url : media?.thumbnail_url;
  const presentation = tweet ? getXPostPresentation(tweet) : null;
  const text =
    link.note || presentation?.text || link.metaDescription || "内容尚未补全，可先查看原帖。";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" data-testid="x-bookmark-preview">
      <div className="flex h-9 shrink-0 items-center gap-2">
        <Avatar className="size-8 shrink-0">
          <AvatarImage src={tweet?.author.profile_image_url} alt="" />
          <AvatarFallback>X</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <a
            href={link.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-semibold hover:underline"
            title={link.title || tweet?.author.name || "X 帖子"}
          >
            {link.title || tweet?.author.name || "X 帖子"}
          </a>
          <span className="block truncate text-xs text-muted-foreground">
            {tweet ? `@${tweet.author.username}` : "尚未补全"}
          </span>
        </div>
        <XSourceBadge compact type={getXContentTypes(tweet)[0] ?? "pending"} />
      </div>
      <SourceLinks link={link} shortUrl={shortUrl} />
      <Button
        variant="ghost"
        className={`flex w-full flex-col items-stretch justify-start overflow-hidden p-0 text-left text-sm font-normal leading-5 hover:bg-transparent ${media ? "h-10 shrink-0" : "min-h-0 flex-1"}`}
        onClick={onOpenDetails}
        aria-label="查看帖子正文"
      >
        <span
          className={
            media
              ? "line-clamp-2 whitespace-pre-wrap break-words"
              : "line-clamp-6 whitespace-pre-wrap break-words"
          }
        >
          {text}
        </span>
      </Button>
      {media && (
        <Button
          variant="ghost"
          onClick={() => (media.type === "PHOTO" ? onOpenDetails() : onPlayMedia(media.id))}
          aria-label={media.type === "PHOTO" ? "查看帖子图片" : "播放帖子视频"}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-widget border border-border/60 bg-accent p-0"
        >
          {image && (
            <img
              src={image}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}
          {media.type !== "PHOTO" && (
            <Play className="relative size-8 rounded-full bg-background/80 p-1" />
          )}
          {(tweet?.media.length ?? 0) > 1 && (
            <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs">
              {tweet?.media.length} 个附件
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
