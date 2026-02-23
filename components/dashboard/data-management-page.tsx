"use client";

import { useRef } from "react";
import { useSettingsViewModel } from "@/viewmodels/useSettingsViewModel";
import { useBackyViewModel } from "@/viewmodels/useBackyViewModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Upload, CheckCircle, CloudUpload, Pencil, X, CheckCircle2, XCircle } from "lucide-react";
import { formatFileSize } from "@/models/backy";

export function DataManagementPage() {
  const {
    isExporting,
    isImporting,
    importResult,
    handleExport,
    handleImport,
    clearImportResult,
  } = useSettingsViewModel();

  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleImport(file);
    }
    // Reset so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      {/* ── 数据导出 ──────────────────────────────────────────────── */}
      <Card className="border-0 bg-secondary shadow-none">
        <CardHeader className="px-4 py-3 md:px-5 md:py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Download className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            数据导出
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
          <p className="mb-4 text-sm text-muted-foreground">
            将所有链接数据导出为 JSON 文件，可用于备份或迁移。
          </p>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            variant="outline"
            size="sm"
          >
            {isExporting ? "导出中..." : "导出链接"}
          </Button>
        </CardContent>
      </Card>

      {/* ── 数据导入 ──────────────────────────────────────────────── */}
      <Card className="border-0 bg-secondary shadow-none">
        <CardHeader className="px-4 py-3 md:px-5 md:py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Upload className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            数据导入
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
          <p className="mb-4 text-sm text-muted-foreground">
            从 JSON 文件导入链接数据。已存在的短链接将被自动跳过。
          </p>

          {isImporting ? (
            <p className="text-sm text-muted-foreground">导入中...</p>
          ) : importResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>
                  导入完成：成功 <strong>{importResult.created}</strong> 条，跳过{" "}
                  <strong>{importResult.skipped}</strong> 条
                </span>
              </div>
              <Button
                onClick={clearImportResult}
                variant="outline"
                size="sm"
              >
                确定
              </Button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={onFileChange}
                data-testid="import-file-input"
                className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent/80 file:cursor-pointer"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 远程备份 (Backy) ────────────────────────────────────── */}
      <BackySection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backy remote backup sub-component
// ---------------------------------------------------------------------------

function BackySection() {
  const vm = useBackyViewModel();

  return (
    <Card className="border-0 bg-secondary shadow-none">
      <CardHeader className="px-4 py-3 md:px-5 md:py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CloudUpload className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          远程备份
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
        <p className="mb-4 text-sm text-muted-foreground">
          将数据备份推送到 Backy 远程存储服务，支持版本管理和历史记录。
        </p>

        {vm.isLoading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : !vm.isConfigured || vm.isEditing ? (
          /* ── Config form ─────────────────────────────────────── */
          <div className="max-w-lg space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="backy-url" className="text-xs text-muted-foreground">
                Webhook URL
              </label>
              <Input
                id="backy-url"
                data-testid="backy-webhook-url"
                placeholder="https://backy.example.com/api/webhook/..."
                value={vm.webhookUrl}
                onChange={(e) => vm.setWebhookUrl(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="backy-key" className="text-xs text-muted-foreground">
                API Key
              </label>
              <Input
                id="backy-key"
                data-testid="backy-api-key"
                type="password"
                placeholder="输入 API Key"
                value={vm.apiKey}
                onChange={(e) => vm.setApiKey(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            {vm.error && (
              <p className="text-xs text-destructive" data-testid="backy-error">
                {vm.error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                onClick={vm.handleSave}
                disabled={vm.isSaving}
                variant="outline"
                size="sm"
              >
                {vm.isSaving ? "保存中..." : "保存"}
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
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={vm.handleTest}
                disabled={vm.isTesting}
                variant="outline"
                size="sm"
              >
                {vm.isTesting ? "测试中..." : "测试连接"}
              </Button>
              <Button
                onClick={vm.handlePush}
                disabled={vm.isPushing}
                variant="outline"
                size="sm"
              >
                {vm.isPushing ? "推送中..." : "推送备份"}
              </Button>
              <Button
                onClick={vm.handleLoadHistory}
                disabled={vm.isLoadingHistory}
                variant="outline"
                size="sm"
              >
                {vm.isLoadingHistory ? "加载中..." : "查看历史"}
              </Button>
            </div>

            {/* Test result */}
            {vm.testResult && (
              <div className="flex items-center gap-2 text-xs" data-testid="backy-test-result">
                {vm.testResult.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className={vm.testResult.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                  {vm.testResult.message}
                </span>
                <button
                  onClick={vm.clearTestResult}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="关闭"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Push result */}
            {vm.pushResult && (
              <div className="flex items-center gap-2 text-xs" data-testid="backy-push-result">
                {vm.pushResult.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className={vm.pushResult.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                  {vm.pushResult.message}
                </span>
                <button
                  onClick={vm.clearPushResult}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="关闭"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Backup history */}
            {vm.history && (
              <div className="space-y-2 border-t border-border/50 pt-3" data-testid="backy-history">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">
                    备份历史
                  </p>
                  <p className="text-xs text-muted-foreground">
                    共 {vm.history.total_backups} 次备份
                  </p>
                </div>
                {vm.history.recent_backups.length > 0 ? (
                  <div className="space-y-1.5">
                    {vm.history.recent_backups.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between rounded bg-accent/50 px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <code className="text-foreground">{entry.tag}</code>
                          <span className="text-muted-foreground">{entry.environment}</span>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{formatFileSize(entry.file_size)}</span>
                          <span>{new Date(entry.created_at).toLocaleDateString("zh-CN")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">暂无备份记录</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
