"use client";

import { Button } from "@nocoo/basalt/components/button";
import { Input } from "@nocoo/basalt/components/input";
import { Label } from "@nocoo/basalt/components/label";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
} from "@nocoo/basalt/icons";
import { FeatureCard } from "@/components/dashboard/feature-card";
import type { XrayViewModel } from "@/viewmodels/useXrayViewModel";
import { TweetCard } from "./tweet-card";

function TestInputArea({ vm }: { vm: XrayViewModel }) {
  return (
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
            size="md"
            className="h-9"
          >
            {vm.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            获取
          </Button>
        </div>
      </div>

      {vm.tweetInput && (
        <div className="flex items-center gap-2 text-xs">
          {vm.extractedId ? (
            <>
              <CheckCircle className="h-3.5 w-3.5 text-basalt-success" />
              <span className="text-basalt-muted-foreground">Tweet ID:</span>
              <code className="rounded bg-basalt-accent px-1.5 py-0.5">{vm.extractedId}</code>
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-basalt-warning" />
              <span className="text-basalt-warning">无法解析 Tweet ID</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FetchErrorBanner({ error }: { error: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-md border border-basalt-destructive/20 bg-basalt-destructive/5 p-3">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-basalt-destructive" />
      <p className="text-sm text-basalt-destructive">{error}</p>
    </div>
  );
}

function TweetResultBlock({ vm }: { vm: XrayViewModel }) {
  if (!vm.tweetResult) return null;
  return (
    <div className="mt-4 space-y-3">
      <TweetCard tweet={vm.tweetResult.data} />
      <Button
        onClick={vm.toggleRawJson}
        variant="ghost"
        size="md"
        className="text-xs text-basalt-muted-foreground"
      >
        {vm.showRawJson ? (
          <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
        )}
        {vm.showRawJson ? "收起" : "展开"} 原始 JSON
      </Button>
      {vm.showRawJson && (
        <pre className="max-h-96 overflow-auto rounded-basalt-widget bg-basalt-background p-3 text-xs leading-relaxed">
          {JSON.stringify(vm.tweetResult, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function TestSection({ vm }: { vm: XrayViewModel }) {
  return (
    <FeatureCard
      icon={Search}
      accent="teal"
      title="接口测试"
      description={
        <>
          粘贴 Twitter/X 帖子链接，自动提取 ID 并调用 API 获取内容。
          {!vm.isConfigured && (
            <span className="ml-1 text-basalt-warning">（请先配置 Xray API）</span>
          )}
        </>
      }
    >
      <TestInputArea vm={vm} />
      {vm.fetchError && <FetchErrorBanner error={vm.fetchError} />}
      <TweetResultBlock vm={vm} />
    </FeatureCard>
  );
}
