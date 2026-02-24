"use client";

import { useXrayViewModel } from "@/viewmodels/useXrayViewModel";
import { formatCount, formatTweetDate } from "@/models/xray";
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
} from "lucide-react";

export function XrayPage() {
  const vm = useXrayViewModel();

  return (
    <div className="space-y-6">
      {/* ── API 配置 ─────────────────────────────────────────── */}
      <ConfigSection vm={vm} />

      {/* ── 接口测试 ─────────────────────────────────────────── */}
      <TestSection vm={vm} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config section
// ---------------------------------------------------------------------------

function ConfigSection({ vm }: { vm: ReturnType<typeof useXrayViewModel> }) {
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
          配置 xray API 的地址和认证 Token，用于获取 Twitter/X 帖子内容。
        </p>
        <Separator className="mb-4" />

        {vm.isLoading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : !vm.isConfigured || vm.isEditing ? (
          /* ── Config form ─────────────────────────────────── */
          <div className="max-w-lg space-y-4">
            <div className="space-y-1">
              <Label htmlFor="xray-url" className="text-sm">
                API URL
              </Label>
              <Input
                id="xray-url"
                data-testid="xray-api-url"
                placeholder="http://localhost:7027"
                value={vm.apiUrl}
                onChange={(e) => vm.setApiUrl(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="xray-token" className="text-sm">
                Token
              </Label>
              <Input
                id="xray-token"
                data-testid="xray-api-token"
                type="password"
                placeholder="输入 API Token"
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
              <span className="text-xs text-muted-foreground">Token:</span>
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
            <div className="rounded-lg border bg-background p-4 space-y-3">
              {/* Author row */}
              <div className="flex items-center gap-3">
                <a
                  href={`https://x.com/${vm.tweetResult.data.author.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={vm.tweetResult.data.author.profile_image_url}
                    alt={vm.tweetResult.data.author.name}
                    className="h-10 w-10 rounded-full transition-opacity hover:opacity-80"
                  />
                </a>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`https://x.com/${vm.tweetResult.data.author.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold truncate hover:underline"
                    >
                      {vm.tweetResult.data.author.name}
                    </a>
                    {vm.tweetResult.data.author.is_verified && (
                      <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <a
                      href={`https://x.com/${vm.tweetResult.data.author.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      @{vm.tweetResult.data.author.username}
                    </a>
                    <span>·</span>
                    <span>
                      {formatCount(vm.tweetResult.data.author.followers_count)}{" "}
                      followers
                    </span>
                  </div>
                </div>
              </div>

              {/* Tweet text */}
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {vm.tweetResult.data.text}
              </p>

              {/* Entities: URLs */}
              {vm.tweetResult.data.entities.urls.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {vm.tweetResult.data.entities.urls.map((url) => (
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
              {vm.tweetResult.data.entities.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {vm.tweetResult.data.entities.hashtags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Timestamp + lang */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatTweetDate(vm.tweetResult.data.created_at)}</span>
                <span>·</span>
                <span className="uppercase">{vm.tweetResult.data.lang}</span>
                {vm.tweetResult.data.is_retweet && (
                  <Badge variant="secondary" className="text-[10px]">
                    转推
                  </Badge>
                )}
                {vm.tweetResult.data.is_quote && (
                  <Badge variant="secondary" className="text-[10px]">
                    引用
                  </Badge>
                )}
                {vm.tweetResult.data.is_reply && (
                  <Badge variant="secondary" className="text-[10px]">
                    回复
                  </Badge>
                )}
              </div>

              {/* Metrics bar */}
              <Separator />
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <MetricItem
                  icon={Eye}
                  value={vm.tweetResult.data.metrics.view_count}
                  label="浏览"
                />
                <MetricItem
                  icon={Heart}
                  value={vm.tweetResult.data.metrics.like_count}
                  label="喜欢"
                />
                <MetricItem
                  icon={Repeat2}
                  value={vm.tweetResult.data.metrics.retweet_count}
                  label="转推"
                />
                <MetricItem
                  icon={MessageCircle}
                  value={vm.tweetResult.data.metrics.reply_count}
                  label="回复"
                />
                <MetricItem
                  icon={Quote}
                  value={vm.tweetResult.data.metrics.quote_count}
                  label="引用"
                />
                <MetricItem
                  icon={Bookmark}
                  value={vm.tweetResult.data.metrics.bookmark_count}
                  label="收藏"
                />
              </div>

              {/* View original tweet */}
              <Separator />
              <div>
                <a
                  href={vm.tweetResult.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="text-xs">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    查看原帖
                  </Button>
                </a>
              </div>
            </div>

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
