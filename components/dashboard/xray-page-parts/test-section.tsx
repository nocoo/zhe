"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FeatureCard } from "@/components/dashboard/feature-card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle, Search, ChevronDown, ChevronUp } from "lucide-react";
import { type XrayViewModel } from "@/viewmodels/useXrayViewModel";
import { TweetCard } from "./tweet-card";

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
            <span className="ml-1 text-warning">（未配置 API，将使用 Mock 数据）</span>
          )}
        </>
      }
    >

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
                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                  <span className="text-muted-foreground">Tweet ID:</span>
                  <code className="rounded bg-accent px-1.5 py-0.5">
                    {vm.extractedId}
                  </code>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <span className="text-warning">
                    无法解析 Tweet ID
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Fetch error */}
        {vm.fetchError && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
            <p className="text-sm text-destructive">
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
    </FeatureCard>
  );
}
