"use client";

import { useBackyViewModel, type BackyInitialData } from "@/viewmodels/useBackyViewModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CloudUpload,
  Pencil,
  Loader2,
  Save,
  Plug,
  Send,
  RefreshCw,
  History,
  AlertTriangle,
} from "lucide-react";
import { formatFileSize, formatTimeAgo } from "@/models/backy";

/** Human-readable labels for backup stat keys */
const STAT_LABELS: Record<string, string> = {
  links: "链接",
  folders: "文件夹",
  tags: "标签",
  linkTags: "关联",
};

export function BackyPage({ initialData }: { initialData?: BackyInitialData }) {
  const vm = useBackyViewModel(initialData);

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-secondary shadow-none">
        <CardHeader className="px-4 py-3 md:px-5 md:py-4">
          <CardTitle className="flex items-center gap-3 text-sm font-medium">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <CloudUpload className="h-4 w-4 text-violet-500" strokeWidth={1.5} />
            </div>
            <div className="flex items-center gap-2">
              <span>远程备份</span>
              {vm.isConfigured && (
                <Badge variant={vm.environment === "prod" ? "success" : "warning"}>
                  {vm.environment}
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
          <p className="mb-4 text-sm text-muted-foreground">
            将数据备份推送到 Backy 远程存储服务，支持版本管理和历史记录。
          </p>
          <Separator className="mb-4" />

          {vm.isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : !vm.isConfigured || vm.isEditing ? (
            /* ── Config form ─────────────────────────────────────── */
            <div className="max-w-lg space-y-4">
              <div className="space-y-1">
                <Label htmlFor="backy-url" className="text-sm">
                  Webhook URL
                </Label>
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
                <Label htmlFor="backy-key" className="text-sm">
                  API Key
                </Label>
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
                <p className="text-xs text-destructive" data-testid="backy-error">
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
                  {vm.isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
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
            /* ── Configured state ────────────────────────────────── */
            <div className="space-y-4">
              {/* Config display */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Webhook:</span>
                  <code className="rounded bg-accent px-2 py-0.5 text-xs break-all">
                    {vm.webhookUrl}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">API Key:</span>
                  <code className="rounded bg-accent px-2 py-0.5 text-xs">
                    {vm.maskedApiKey}
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

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <Button
                  onClick={vm.handleTest}
                  disabled={vm.isTesting}
                  variant="outline"
                  size="sm"
                >
                  {vm.isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Plug className="mr-2 h-4 w-4" />
                  测试连接
                </Button>
                <Button
                  onClick={vm.handlePush}
                  disabled={vm.isPushing}
                  variant="outline"
                  size="sm"
                >
                  {vm.isPushing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Send className="mr-2 h-4 w-4" />
                  推送备份
                </Button>
              </div>

              {/* Test result */}
              {vm.testResult && (
                <div
                  className={`flex items-start gap-2 rounded-md border p-3 ${
                    vm.testResult.ok
                      ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                      : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
                  }`}
                  data-testid="backy-test-result"
                >
                  {vm.testResult.ok ? (
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {vm.testResult.message}
                    </p>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {vm.testResult.message}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Push result */}
              {vm.pushResult && (
                <div
                  className={`rounded-md border p-3 ${
                    vm.pushResult.ok
                      ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                      : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
                  }`}
                  data-testid="backy-push-result"
                >
                  {vm.pushResult.ok ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">
                        {vm.pushResult.message}
                      </p>
                      {vm.pushResult.request && (
                        <div className="space-y-1 text-xs text-green-700 dark:text-green-300">
                          <p>Tag: {vm.pushResult.request.tag}</p>
                          <p>
                            文件: {vm.pushResult.request.fileName} (
                            {formatFileSize(vm.pushResult.request.fileSizeBytes)})
                          </p>
                          <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
                            {Object.entries(vm.pushResult.request.backupStats).map(
                              ([key, count]) => (
                                <span key={key}>
                                  {STAT_LABELS[key] ?? key}: {count}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                      <div className="text-sm text-red-700 dark:text-red-300">
                        <p>{vm.pushResult.message}</p>
                        {vm.pushResult.response && (
                          <p className="mt-1 text-xs">
                            HTTP {vm.pushResult.response.status}:{" "}
                            {JSON.stringify(vm.pushResult.response.body)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Remote history panel */}
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">远程备份记录</span>
                    {vm.history && (
                      <Badge variant="secondary">{vm.history.total_backups} 份</Badge>
                    )}
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
                        <div
                          key={entry.id}
                          className="space-y-1 rounded-md border bg-muted/50 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant={entry.environment === "prod" ? "success" : "warning"}>
                              {entry.environment}
                            </Badge>
                            <span className="text-muted-foreground">
                              {formatFileSize(entry.file_size)}
                            </span>
                          </div>
                          <p className="truncate text-muted-foreground" title={entry.tag}>
                            {entry.tag}
                          </p>
                          <p className="text-muted-foreground">
                            {formatTimeAgo(entry.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground" data-testid="backy-history">
                      暂无备份记录
                    </p>
                  )
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
