"use client";

import { useXrayViewModel } from "@/viewmodels/useXrayViewModel";
import {
  formatCount,
  formatTweetDate,
  XRAY_PRESETS,
  type XrayTweetData,
  type XrayTweetMedia,
} from "@/models/xray";
import type { UrlMode } from "@/viewmodels/useXrayViewModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Radar,
  Pencil,
  Loader2,
  Save,
  Search,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  Heart,
  Repeat2,
  MessageCircle,
  Bookmark,
  Quote,
  CheckCircle,
  BadgeCheck,
  ExternalLink,
  Image as ImageIcon,
  Play,
  RefreshCw,
  Plus,
  Check,
  BookmarkIcon,
} from "lucide-react";

export function XrayPage() {
  const vm = useXrayViewModel();

  return (
    <div className="space-y-6">
      {/* ── API 配置 + 接口测试（并排） ──────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ConfigSection vm={vm} />
        <TestSection vm={vm} />
      </div>

      {/* ── 我的书签 ─────────────────────────────────────────── */}
      <BookmarksSection vm={vm} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config section
// ---------------------------------------------------------------------------

function ConfigSection({ vm }: { vm: ReturnType<typeof useXrayViewModel> }) {
  const urlModes: { label: UrlMode; display: string }[] = [
    ...XRAY_PRESETS.map((p) => ({ label: p.label as UrlMode, display: `${p.label}` })),
    { label: "custom" as UrlMode, display: "Custom" },
  ];

  return (
    <Card className="border-0 bg-secondary shadow-none">
      <CardHeader className="px-4 py-3 md:px-5 md:py-4">
        <CardTitle className="flex items-center gap-3 text-sm font-medium">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
            <Radar className="h-4 w-4 text-blue-500" strokeWidth={1.5} />
          </div>
          <span>API 配置</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
        <p className="mb-4 text-sm text-muted-foreground">
          配置 xray API 的地址和认证 Key，用于获取 Twitter/X 帖子内容。
        </p>
        <Separator className="mb-4" />

        {vm.isLoading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : !vm.isConfigured || vm.isEditing ? (
          /* ── Config form ─────────────────────────────────── */
          <div className="max-w-lg space-y-4">
            {/* URL mode selector */}
            <div className="space-y-1">
              <Label className="text-sm">API URL</Label>
              <div className="flex flex-wrap gap-1.5">
                {urlModes.map((mode) => (
                  <Button
                    key={mode.label}
                    variant={vm.urlMode === mode.label ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => vm.handleUrlModeChange(mode.label)}
                  >
                    {mode.display}
                  </Button>
                ))}
              </div>
              {vm.urlMode === "custom" ? (
                <Input
                  id="xray-url"
                  data-testid="xray-api-url"
                  placeholder="https://your-xray-api.example.com"
                  value={vm.apiUrl}
                  onChange={(e) => vm.setApiUrl(e.target.value)}
                  className="mt-1.5 h-9"
                />
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {vm.apiUrl}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="xray-token" className="text-sm">
                API Key
              </Label>
              <Input
                id="xray-token"
                data-testid="xray-api-token"
                type="password"
                placeholder="输入 API Key"
                value={vm.apiToken}
                onChange={(e) => vm.setApiToken(e.target.value)}
                className="h-9"
              />
            </div>

            {vm.error && (
              <p className="text-xs text-destructive" data-testid="xray-error">
                {vm.error}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button
                onClick={vm.handleSave}
                disabled={vm.isSaving}
                variant="outline"
                size="sm"
              >
                {vm.isSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <Save className="mr-2 h-4 w-4" />
                保存
              </Button>
              {vm.isEditing && (
                <Button
                  onClick={vm.cancelEditing}
                  variant="ghost"
                  size="sm"
                >
                  取消
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* ── Configured state ────────────────────────────── */
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">API URL:</span>
              <code className="rounded bg-accent px-2 py-0.5 text-xs break-all">
                {vm.apiUrl}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Key:</span>
              <code className="rounded bg-accent px-2 py-0.5 text-xs">
                {vm.maskedToken}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={vm.startEditing}
                aria-label="编辑配置"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Test section
// ---------------------------------------------------------------------------

function TestSection({ vm }: { vm: ReturnType<typeof useXrayViewModel> }) {
  return (
    <Card className="border-0 bg-secondary shadow-none">
      <CardHeader className="px-4 py-3 md:px-5 md:py-4">
        <CardTitle className="flex items-center gap-3 text-sm font-medium">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <Search className="h-4 w-4 text-emerald-500" strokeWidth={1.5} />
          </div>
          <span>接口测试</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
        <p className="mb-4 text-sm text-muted-foreground">
          粘贴 Twitter/X 帖子链接，自动提取 ID 并调用 API 获取内容。
          {!vm.isConfigured && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              （未配置 API，将使用 Mock 数据）
            </span>
          )}
        </p>
        <Separator className="mb-4" />

        {/* Input area */}
        <div className="max-w-lg space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tweet-url" className="text-sm">
              帖子 URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="tweet-url"
                data-testid="xray-tweet-input"
                placeholder="https://x.com/user/status/..."
                value={vm.tweetInput}
                onChange={(e) => vm.setTweetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && vm.extractedId && !vm.isFetching) {
                    vm.handleFetchTweet();
                  }
                }}
                className="h-9 flex-1"
              />
              <Button
                onClick={vm.handleFetchTweet}
                disabled={!vm.extractedId || vm.isFetching}
                variant="outline"
                size="sm"
                className="h-9"
              >
                {vm.isFetching && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                获取
              </Button>
            </div>
          </div>

          {/* Extracted ID display */}
          {vm.tweetInput && (
            <div className="flex items-center gap-2 text-xs">
              {vm.extractedId ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-muted-foreground">Tweet ID:</span>
                  <code className="rounded bg-accent px-1.5 py-0.5">
                    {vm.extractedId}
                  </code>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">
                    无法解析 Tweet ID
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Fetch error */}
        {vm.fetchError && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {vm.fetchError}
            </p>
          </div>
        )}

        {/* Tweet result */}
        {vm.tweetResult && (
          <div className="mt-4 space-y-3">
            {/* Mock indicator */}
            {vm.isMockResult && (
              <Badge variant="warning">Mock 数据</Badge>
            )}

            {/* Tweet card */}
            <TweetCard tweet={vm.tweetResult.data} />

            {/* Raw JSON toggle */}
            <Button
              onClick={vm.toggleRawJson}
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
            >
              {vm.showRawJson ? (
                <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
              )}
              {vm.showRawJson ? "收起" : "展开"} 原始 JSON
            </Button>
            {vm.showRawJson && (
              <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">
                {JSON.stringify(vm.tweetResult, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bookmarks section — shows the user's X bookmarks with "add to system" button
// ---------------------------------------------------------------------------

function BookmarksSection({ vm }: { vm: ReturnType<typeof useXrayViewModel> }) {
  return (
    <Card className="border-0 bg-secondary shadow-none">
      <CardHeader className="px-4 py-3 md:px-5 md:py-4">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <BookmarkIcon className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
            </div>
            <span>我的书签</span>
            {vm.bookmarks.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {vm.bookmarks.length}
              </Badge>
            )}
          </div>
          <Button
            onClick={vm.handleFetchBookmarks}
            disabled={!vm.isConfigured || vm.isFetchingBookmarks}
            variant="outline"
            size="sm"
          >
            {vm.isFetchingBookmarks ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {vm.isFetchingBookmarks ? "加载中" : "加载书签"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
        {!vm.isConfigured ? (
          <p className="text-sm text-muted-foreground">
            请先在上方配置 xray API，然后即可加载您的 X 书签。
          </p>
        ) : vm.bookmarksError ? (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {vm.bookmarksError}
            </p>
          </div>
        ) : vm.bookmarks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            点击「加载书签」获取您的 X 书签列表。
          </p>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
            {vm.bookmarks.map((tweet) => (
              <div key={tweet.id} className="mb-4 break-inside-avoid">
                <TweetCard
                  tweet={tweet}
                  action={
                    <BookmarkAddButton
                      tweetId={tweet.id}
                      tweetUrl={tweet.url}
                      isAdding={vm.addingBookmarkIds.has(tweet.id)}
                      isAdded={vm.addedBookmarkIds.has(tweet.id)}
                      onAdd={vm.handleAddBookmark}
                    />
                  }
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bookmark add button — handles adding a tweet to the link system
// ---------------------------------------------------------------------------

function BookmarkAddButton({
  tweetId,
  tweetUrl,
  isAdding,
  isAdded,
  onAdd,
}: {
  tweetId: string;
  tweetUrl: string;
  isAdding: boolean;
  isAdded: boolean;
  onAdd: (tweetUrl: string, tweetId: string) => void;
}) {
  if (isAdded) {
    return (
      <Button variant="ghost" size="sm" disabled className="text-green-600 dark:text-green-400">
        <Check className="mr-1.5 h-4 w-4" />
        已收录
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isAdding}
      onClick={() => onAdd(tweetUrl, tweetId)}
    >
      {isAdding ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Plus className="mr-1.5 h-4 w-4" />
      )}
      {isAdding ? "收录中" : "收录"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Tweet card — renders a single tweet with author, text, media, metrics
// ---------------------------------------------------------------------------

function TweetCard({ tweet, action }: { tweet: XrayTweetData; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3 dark:bg-neutral-900">
      {/* Author row */}
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
              <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
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
            <span>
              {formatCount(tweet.author.followers_count)} followers
            </span>
          </div>
        </div>
      </div>

      {/* Tweet text */}
      <p className="text-sm whitespace-pre-wrap leading-relaxed">
        {tweet.text}
      </p>

      {/* Media */}
      {tweet.media && tweet.media.length > 0 && (
        <MediaGrid media={tweet.media} />
      )}

      {/* Entities: URLs */}
      {tweet.entities.urls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tweet.entities.urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400 break-all"
            >
              {url}
            </a>
          ))}
        </div>
      )}

      {/* Entities: Hashtags */}
      {tweet.entities.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tweet.entities.hashtags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              #{tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Entities: Mentioned users */}
      {tweet.entities.mentioned_users.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tweet.entities.mentioned_users.map((user) => (
            <a
              key={user}
              href={`https://x.com/${user}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              @{user}
            </a>
          ))}
        </div>
      )}

      {/* Timestamp + lang + flags + original link */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatTweetDate(tweet.created_at)}</span>
        <span>·</span>
        <span className="uppercase">{tweet.lang}</span>
        {tweet.is_retweet && (
          <Badge variant="secondary" className="text-[10px]">
            转推
          </Badge>
        )}
        {tweet.is_quote && (
          <Badge variant="secondary" className="text-[10px]">
            引用
          </Badge>
        )}
        {tweet.is_reply && (
          <Badge variant="secondary" className="text-[10px]">
            回复
          </Badge>
        )}
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

      {/* Metrics bar */}
      <Separator />
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <MetricItem icon={Eye} value={tweet.metrics.view_count} label="浏览" />
        <MetricItem icon={Heart} value={tweet.metrics.like_count} label="喜欢" />
        <MetricItem icon={Repeat2} value={tweet.metrics.retweet_count} label="转推" />
        <MetricItem icon={MessageCircle} value={tweet.metrics.reply_count} label="回复" />
        <MetricItem icon={Quote} value={tweet.metrics.quote_count} label="引用" />
        <MetricItem icon={Bookmark} value={tweet.metrics.bookmark_count} label="收藏" />
      </div>

      {/* Quoted tweet */}
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

      {/* Optional action slot (e.g. bookmark add button) */}
      {action && (
        <>
          <Separator />
          <div className="flex justify-end">{action}</div>
        </>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Media grid — renders photos and video thumbnails
// ---------------------------------------------------------------------------

function MediaGrid({ media }: { media: XrayTweetMedia[] }) {
  return (
    <div
      className={`grid gap-2 ${
        media.length === 1
          ? "grid-cols-1"
          : media.length === 2
            ? "grid-cols-2"
            : media.length === 3
              ? "grid-cols-2"
              : "grid-cols-2"
      }`}
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
            /* VIDEO or GIF — show thumbnail with play overlay */
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

// ---------------------------------------------------------------------------
// Metric item helper
// ---------------------------------------------------------------------------

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
