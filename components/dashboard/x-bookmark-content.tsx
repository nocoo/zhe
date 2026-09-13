"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  LayerCard,
} from "@nocoo/basalt";
import { BadgeCheck, Clock3, Eye, Heart, MessageCircle, RefreshCw, Repeat2 } from "lucide-react";
import { useState } from "react";
import { retryXBookmarkAction } from "@/actions/connector";
import type { XMedia, XPost } from "@/cli/src/connector/core";
import type { XBookmark } from "@/lib/connector/jobs";
import { formatCount, formatTweetDate } from "@/models/xray";

function PostText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = text.length > 600;
  return (
    <div>
      <p
        className={`whitespace-pre-wrap break-words text-sm leading-7 ${collapsible && !expanded ? "line-clamp-6" : ""}`}
      >
        {text}
      </p>
      {collapsible && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-primary"
        >
          {expanded ? "收起全文" : "展开全文"}
        </Button>
      )}
    </div>
  );
}

function PostMedia({ media, index }: { media: XMedia; index: number }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <LayerCard.Well className="flex min-h-32 items-center justify-center gap-2">
        <span role="status" className="text-sm text-muted-foreground">
          媒体暂时无法播放
        </span>
        <Button size="sm" variant="outline" onClick={() => setFailed(false)}>
          重试
        </Button>
      </LayerCard.Well>
    );
  if (media.type !== "PHOTO")
    return (
      <div className="overflow-hidden rounded-widget bg-black">
        <video
          src={media.url}
          poster={media.thumbnail_url}
          controls
          playsInline
          preload="none"
          aria-label="已归档的 X 视频"
          className="mx-auto block max-h-96 w-full object-contain"
          style={{
            aspectRatio: media.width && media.height ? `${media.width}/${media.height}` : "16/9",
          }}
          onError={() => setFailed(true)}
        >
          <track kind="captions" />
        </video>
      </div>
    );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full overflow-hidden rounded-widget p-0"
          aria-label={`查看图片 ${index + 1}`}
        >
          <img
            src={media.url}
            alt={`帖子图片 ${index + 1}`}
            loading="lazy"
            className="max-h-96 w-full object-cover"
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

function Quote({ tweet }: { tweet: XPost }) {
  return (
    <LayerCard.Well outlined className="space-y-2 rounded-widget">
      <a
        href={tweet.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium hover:underline"
      >
        {tweet.author.name} <span className="text-muted-foreground">@{tweet.author.username}</span>
      </a>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{tweet.text}</p>
    </LayerCard.Well>
  );
}

export function XBookmarkContent({ bookmark }: { bookmark: XBookmark }) {
  const tweet = bookmark.tweet;
  if (!tweet) return null;
  const metrics = [
    { icon: Heart, label: "喜欢", count: tweet.metrics.like_count },
    { icon: Repeat2, label: "转帖", count: tweet.metrics.retweet_count },
    { icon: MessageCircle, label: "回复", count: tweet.metrics.reply_count },
    { icon: Eye, label: "浏览", count: tweet.metrics.view_count },
  ];
  return (
    <LayerCard.Body className="space-y-4" data-testid="x-bookmark-content">
      <div className="flex items-start gap-3">
        <Avatar>
          <AvatarImage src={tweet.author.profile_image_url} alt={tweet.author.name} />
          <AvatarFallback>{tweet.author.name.slice(0, 1) || "X"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <a
              href={`https://x.com/${tweet.author.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-semibold hover:underline"
            >
              {tweet.author.name}
            </a>
            {tweet.author.is_verified && (
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="认证账号" />
            )}
          </div>
          <p className="break-all text-xs text-muted-foreground">@{tweet.author.username}</p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          X
        </Badge>
      </div>
      <PostText text={tweet.text} />
      {tweet.media.length > 0 && (
        <div
          className={`grid gap-2 ${tweet.media.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}
          data-testid="x-media-grid"
        >
          {tweet.media.map((media, index) => (
            <PostMedia key={media.id} media={media} index={index} />
          ))}
        </div>
      )}
      {tweet.quoted_tweet && <Quote tweet={tweet.quoted_tweet} />}
      {tweet.entities.urls.length > 0 && (
        <div className="flex flex-col gap-1">
          {tweet.entities.urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-xs text-primary hover:underline"
            >
              {url}
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <time dateTime={tweet.created_at}>{formatTweetDate(tweet.created_at)}</time>
        <div className="flex flex-wrap gap-4">
          {metrics.map(({ icon: Icon, label, count }) => (
            <span key={label} className="inline-flex items-center gap-1 tabular-nums">
              <Icon className="size-3.5" aria-hidden />
              <span aria-hidden>{formatCount(count)}</span>
              <span className="sr-only">
                {label} {count}
              </span>
            </span>
          ))}
        </div>
      </div>
    </LayerCard.Body>
  );
}

export function XBookmarkStatus({
  bookmark,
  linkId,
}: {
  bookmark: XBookmark | undefined;
  linkId: number;
}) {
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<{ version: string; success: boolean } | null>(null);
  const state = bookmark?.state ?? "pending";
  const version = `${linkId}:${state}:${bookmark?.updatedAt ?? 0}`;
  const currentFeedback = feedback?.version === version ? feedback : null;
  const labels = {
    pending: "等待补全",
    running: "正在补全",
    complete: "已补全",
    partial: "正文已保存，媒体待补全",
    failed: "补全暂未完成",
    unavailable: "原帖暂不可访问",
  };
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
      {state === "running" ? (
        <RefreshCw className="size-3 animate-spin" aria-hidden />
      ) : state === "pending" ? (
        <Clock3 className="size-3" aria-hidden />
      ) : null}
      <span>
        {currentFeedback
          ? currentFeedback.success
            ? "已重新排队"
            : "暂时无法重试"
          : labels[state]}
      </span>
      {["failed", "partial", "unavailable"].includes(state) && !currentFeedback?.success && (
        <Button size="sm" variant="ghost" onClick={retry} disabled={retrying}>
          重新补全
        </Button>
      )}
    </div>
  );
}
