"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BadgeCheck,
  Bookmark,
  ExternalLink,
  Eye,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Play,
  Quote,
  Repeat2,
} from "lucide-react";
import {
  formatCount,
  formatTweetDate,
  type XrayTweetData,
  type XrayTweetMedia,
} from "@/models/xray";

// ---- Subcomponents ----------------------------------------------------------

function AuthorRow({ tweet }: { tweet: XrayTweetData }) {
  return (
    <div className="flex items-center gap-3">
      <a
        href={`https://x.com/${tweet.author.username}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tweet.author.profile_image_url}
          alt={tweet.author.name}
          className="h-10 w-10 rounded-full transition-opacity hover:opacity-80"
        />
      </a>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <a
            href={`https://x.com/${tweet.author.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold truncate hover:underline"
          >
            {tweet.author.name}
          </a>
          {tweet.author.is_verified && (
            <BadgeCheck className="h-4 w-4 shrink-0 text-info" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <a
            href={`https://x.com/${tweet.author.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            @{tweet.author.username}
          </a>
          <span>·</span>
          <span>{formatCount(tweet.author.followers_count)} followers</span>
        </div>
      </div>
    </div>
  );
}

function EntitiesBlock({
  entities,
}: {
  entities: XrayTweetData["entities"];
}) {
  return (
    <>
      {entities.urls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entities.urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-info hover:underline break-all"
            >
              {url}
            </a>
          ))}
        </div>
      )}
      {entities.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entities.hashtags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              #{tag}
            </Badge>
          ))}
        </div>
      )}
      {entities.mentioned_users.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entities.mentioned_users.map((user) => (
            <a
              key={user}
              href={`https://x.com/${user}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-info hover:underline"
            >
              @{user}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function MetadataRow({ tweet }: { tweet: XrayTweetData }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{formatTweetDate(tweet.created_at)}</span>
      <span>·</span>
      <span className="uppercase">{tweet.lang}</span>
      {tweet.is_retweet && <Badge variant="secondary" className="text-[10px]">转推</Badge>}
      {tweet.is_quote && <Badge variant="secondary" className="text-[10px]">引用</Badge>}
      {tweet.is_reply && <Badge variant="secondary" className="text-[10px]">回复</Badge>}
      <span>·</span>
      <a
        href={tweet.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        原帖
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function MetricItem({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium tabular-nums">{formatCount(value)}</span>
      <span>{label}</span>
    </div>
  );
}

function MetricsBar({ metrics }: { metrics: XrayTweetData["metrics"] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <MetricItem icon={Eye} value={metrics.view_count} label="浏览" />
      <MetricItem icon={Heart} value={metrics.like_count} label="喜欢" />
      <MetricItem icon={Repeat2} value={metrics.retweet_count} label="转推" />
      <MetricItem icon={MessageCircle} value={metrics.reply_count} label="回复" />
      <MetricItem icon={Quote} value={metrics.quote_count} label="引用" />
      <MetricItem icon={Bookmark} value={metrics.bookmark_count} label="收藏" />
    </div>
  );
}

function MediaGrid({ media }: { media: XrayTweetMedia[] }) {
  return (
    <div
      className={`grid gap-2 ${media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
    >
      {media.map((item) => (
        <div key={item.id} className="relative overflow-hidden rounded-lg">
          {item.type === "PHOTO" ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt="Media"
                className="w-full h-auto rounded-lg transition-opacity hover:opacity-90"
              />
            </a>
          ) : (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnail_url ?? item.url}
                  alt="Video thumbnail"
                  className="w-full h-auto rounded-lg"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60">
                    <Play className="h-5 w-5 text-white" fill="white" />
                  </div>
                </div>
                <div className="absolute top-2 left-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {item.type === "VIDEO" ? (
                      <Play className="mr-1 h-2.5 w-2.5" />
                    ) : (
                      <ImageIcon className="mr-1 h-2.5 w-2.5" />
                    )}
                    {item.type}
                  </Badge>
                </div>
              </div>
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Main exported component -----------------------------------------------

export function TweetCard({
  tweet,
  action,
}: {
  tweet: XrayTweetData;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card bg-secondary p-4 space-y-3">
      <AuthorRow tweet={tweet} />

      <p className="text-sm whitespace-pre-wrap leading-relaxed">{tweet.text}</p>

      {tweet.media && tweet.media.length > 0 && <MediaGrid media={tweet.media} />}

      <EntitiesBlock entities={tweet.entities} />

      <MetadataRow tweet={tweet} />

      <Separator />
      <MetricsBar metrics={tweet.metrics} />

      {tweet.quoted_tweet && (
        <>
          <Separator />
          <div className="pl-3 border-l-2 border-muted-foreground/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              引用推文
            </p>
            <TweetCard tweet={tweet.quoted_tweet} />
          </div>
        </>
      )}

      {action && (
        <>
          <Separator />
          <div className="flex justify-end">{action}</div>
        </>
      )}
    </div>
  );
}
