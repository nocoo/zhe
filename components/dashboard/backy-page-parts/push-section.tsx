"use client";

import {
  AlertTriangle,
  History,
  Loader2,
  Pencil,
  Plug,
  RefreshCw,
  Save,
  Send,
  CloudUpload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FeatureCard } from "@/components/dashboard/feature-card";
import { formatFileSize, formatTimeAgo } from "@/models/backy";
import type { BackyViewModel } from "@/viewmodels/useBackyViewModel";

const STAT_LABELS: Record<string, string> = {
  links: "链接",
  folders: "文件夹",
  tags: "标签",
  linkTags: "关联",
};

function ConfigForm({ vm }: { vm: BackyViewModel }) {
  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-1">
        <Label htmlFor="backy-url" className="text-sm">Webhook URL</Label>
        <Input
          id="backy-url"
          data-testid="backy-webhook-url"
          placeholder="https://backy.example.com/api/webhook/..."
          value={vm.webhookUrl}
          onChange={(e) => vm.setWebhookUrl(e.target.value)}
          className="h-9"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="backy-key" className="text-sm">API Key</Label>
        <Input
          id="backy-key"
          data-testid="backy-api-key"
          type="password"
          placeholder="输入 API Key"
          value={vm.apiKey}
          onChange={(e) => vm.setApiKey(e.target.value)}
          className="h-9"
        />
      </div>
      {vm.error && (
        <p className="text-xs text-destructive" data-testid="backy-error">{vm.error}</p>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={vm.handleSave} disabled={vm.isSaving} variant="outline" size="sm">
          {vm.isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          保存
        </Button>
        {vm.isEditing && (
          <Button onClick={vm.cancelEditing} variant="ghost" size="sm">取消</Button>
        )}
      </div>
    </div>
  );
}

function ConfigDisplay({ vm }: { vm: BackyViewModel }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Webhook:</span>
        <code className="rounded bg-accent px-2 py-0.5 text-xs break-all">{vm.webhookUrl}</code>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">API Key:</span>
        <code className="rounded bg-accent px-2 py-0.5 text-xs">{vm.maskedApiKey}</code>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={vm.startEditing} aria-label="编辑配置">
          <Pencil className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function TestResult({ result }: { result: BackyViewModel["testResult"] }) {
  if (!result) return null;
  return (
    <div
      className={`flex items-start gap-2 rounded-md border p-3 ${
        result.ok ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"
      }`}
      data-testid="backy-test-result"
    >
      {result.ok ? (
        <p className="text-sm text-success">{result.message}</p>
      ) : (
        <>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
          <p className="text-sm text-destructive">{result.message}</p>
        </>
      )}
    </div>
  );
}

function PushResult({ result }: { result: BackyViewModel["pushResult"] }) {
  if (!result) return null;
  return (
    <div
      className={`rounded-md border p-3 ${
        result.ok ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"
      }`}
      data-testid="backy-push-result"
    >
      {result.ok ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-success">{result.message}</p>
          {result.request && (
            <div className="space-y-1 text-xs text-success">
              <p>Tag: {result.request.tag}</p>
              <p>文件: {result.request.fileName} ({formatFileSize(result.request.fileSizeBytes)})</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
                {Object.entries(result.request.backupStats).map(([key, count]) => (
                  <span key={key}>{STAT_LABELS[key] ?? key}: {count}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
          <div className="text-sm text-destructive">
            <p>{result.message}</p>
            {result.response && (
              <p className="mt-1 text-xs">
                HTTP {result.response.status}: {JSON.stringify(result.response.body)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ vm }: { vm: BackyViewModel }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">远程备份记录</span>
          {vm.history && <Badge variant="secondary">{vm.history.total_backups} 份</Badge>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={vm.handleLoadHistory}
          disabled={vm.isLoadingHistory}
          aria-label="刷新历史"
        >
          <RefreshCw className={`h-4 w-4 ${vm.isLoadingHistory ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {vm.history ? (
        vm.history.recent_backups.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2" data-testid="backy-history">
            {vm.history.recent_backups.map((entry) => (
              <div key={entry.id} className="space-y-1 rounded-widget bg-background p-3 text-xs">
                <div className="flex items-center justify-between">
                  <Badge variant={entry.environment === "prod" ? "success" : "warning"}>
                    {entry.environment}
                  </Badge>
                  <span className="text-muted-foreground">{formatFileSize(entry.file_size)}</span>
                </div>
                <p className="truncate text-muted-foreground" title={entry.tag}>{entry.tag}</p>
                <p className="text-muted-foreground">{formatTimeAgo(entry.created_at)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="backy-history">暂无备份记录</p>
        )
      ) : null}
    </div>
  );
}

function ConfiguredView({ vm }: { vm: BackyViewModel }) {
  return (
    <div className="space-y-4">
      <ConfigDisplay vm={vm} />
      <div className="flex items-center gap-2">
        <Button onClick={vm.handleTest} disabled={vm.isTesting} variant="outline" size="sm">
          {vm.isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Plug className="mr-2 h-4 w-4" />测试连接
        </Button>
        <Button onClick={vm.handlePush} disabled={vm.isPushing} variant="outline" size="sm">
          {vm.isPushing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Send className="mr-2 h-4 w-4" />推送备份
        </Button>
      </div>
      <TestResult result={vm.testResult} />
      <PushResult result={vm.pushResult} />
      <Separator />
      <HistoryPanel vm={vm} />
    </div>
  );
}

export function PushSection({ vm }: { vm: BackyViewModel }) {
  const titleNode = (
    <div className="flex items-center gap-2">
      <span>远程备份</span>
      {vm.isConfigured && (
        <Badge variant={vm.environment === "prod" ? "success" : "warning"}>
          {vm.environment}
        </Badge>
      )}
    </div>
  );

  return (
    <FeatureCard
      icon={CloudUpload}
      accent="purple"
      title={titleNode}
      description="将数据备份推送到 Backy 远程存储服务，支持版本管理和历史记录。"
    >
      {vm.isLoading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : !vm.isConfigured || vm.isEditing ? (
        <ConfigForm vm={vm} />
      ) : (
        <ConfiguredView vm={vm} />
      )}
    </FeatureCard>
  );
}
