"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RotateCcw, Trash2, Copy, Check, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureCard } from "@/components/dashboard/feature-card";
import { copyToClipboard } from "@/lib/utils";
import type { BackyViewModel } from "@/viewmodels/useBackyViewModel";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(value);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 800);
    }
  }, [value]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0"
      onClick={handleCopy}
      aria-label={label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function CredentialsView({
  vm,
  pullKey,
  pullWebhookUrl,
}: {
  vm: BackyViewModel;
  pullKey: string;
  pullWebhookUrl: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Webhook URL</p>
        <div className="flex items-center gap-2">
          <code className="rounded bg-accent px-2 py-1 text-xs break-all">{pullWebhookUrl}</code>
          <CopyButton value={pullWebhookUrl} label="复制 Webhook URL" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <p className="text-xs text-muted-foreground">Key</p>
          <code className="rounded bg-accent/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/70 font-mono">
            X-Webhook-Key
          </code>
          <CopyButton value="X-Webhook-Key" label="复制 Header 名" />
        </div>
        <div className="flex items-center gap-2">
          <code className="rounded bg-accent px-2 py-1 text-xs break-all font-mono">{pullKey}</code>
          <CopyButton value={pullKey} label="复制 Key" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={vm.handleGeneratePull}
          disabled={vm.isGeneratingPull}
          variant="outline"
          size="sm"
        >
          {vm.isGeneratingPull ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          重新生成
        </Button>
        <Button
          onClick={vm.handleRevokePull}
          disabled={vm.isRevokingPull}
          variant="outline"
          size="sm"
        >
          {vm.isRevokingPull ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          撤销
        </Button>
      </div>
      <div className="rounded-widget bg-background p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">调用示例</p>
        <code className="block whitespace-pre-wrap text-[11px] text-muted-foreground">
          {`curl -X POST ${pullWebhookUrl} \\\n  -H "X-Webhook-Key: ${pullKey}"`}
        </code>
      </div>
    </div>
  );
}

function EmptyView({ vm }: { vm: BackyViewModel }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        生成 Webhook Key 后，可将 URL 和 Key 配置到 Backy，实现定时自动备份。
      </p>
      <Button onClick={vm.handleGeneratePull} disabled={vm.isGeneratingPull} variant="outline" size="sm">
        {vm.isGeneratingPull ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Webhook className="mr-2 h-4 w-4" />
        )}
        生成凭证
      </Button>
    </div>
  );
}

export function PullSection({ vm }: { vm: BackyViewModel }) {
  const [pullWebhookUrl, setPullWebhookUrl] = useState("/api/backy/pull");
  useEffect(() => {
    setPullWebhookUrl(`${window.location.origin}/api/backy/pull`);
  }, []);

  return (
    <FeatureCard
      icon={Webhook}
      accent="warning"
      title="拉取 Webhook"
      description="提供给 Backy 调用的 Webhook 地址，Backy 可通过此接口触发备份推送。"
    >
      {vm.isLoading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : vm.pullKey ? (
        <CredentialsView vm={vm} pullKey={vm.pullKey} pullWebhookUrl={pullWebhookUrl} />
      ) : (
        <EmptyView vm={vm} />
      )}
    </FeatureCard>
  );
}
