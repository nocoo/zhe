"use client";

import { useRef } from "react";
import { useSettingsViewModel } from "@/viewmodels/useSettingsViewModel";
import { useWebhookViewModel } from "@/viewmodels/useWebhookViewModel";
import { buildWebhookDocumentation } from "@/models/webhook";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, CheckCircle, Webhook, Copy } from "lucide-react";

export function SettingsPage() {
  const {
    isExporting,
    isImporting,
    importResult,
    handleExport,
    handleImport,
    clearImportResult,
  } = useSettingsViewModel();

  const {
    token,
    isLoading: webhookLoading,
    isGenerating,
    isRevoking,
    webhookUrl,
    handleGenerate,
    handleRevoke,
  } = useWebhookViewModel();

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

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
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

      {/* ── Webhook ──────────────────────────────────────────────── */}
      <Card className="border-0 bg-secondary shadow-none">
        <CardHeader className="px-4 py-3 md:px-5 md:py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Webhook className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
          <p className="mb-4 text-sm text-muted-foreground">
            通过 Webhook 令牌，外部系统可以调用 API 创建短链接，无需登录认证。
          </p>

          {webhookLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : token && webhookUrl ? (
            <div className="space-y-4">
              {/* Token display */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">令牌</p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-accent px-2 py-1 text-xs">
                    {token}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyToClipboard(token)}
                    aria-label="复制令牌"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Webhook URL display */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Webhook URL</p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-accent px-2 py-1 text-xs break-all">
                    {webhookUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0"
                    onClick={() => copyToClipboard(webhookUrl)}
                    aria-label="复制 URL"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  variant="outline"
                  size="sm"
                >
                  {isGenerating ? "生成中..." : "重新生成"}
                </Button>
                <Button
                  onClick={handleRevoke}
                  disabled={isRevoking}
                  variant="outline"
                  size="sm"
                >
                  {isRevoking ? "撤销中..." : "撤销令牌"}
                </Button>
              </div>

              {/* Usage documentation */}
              <WebhookUsageDocs webhookUrl={webhookUrl} />
            </div>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              variant="outline"
              size="sm"
            >
              {isGenerating ? "生成中..." : "生成令牌"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhook usage documentation sub-component
// ---------------------------------------------------------------------------

function WebhookUsageDocs({ webhookUrl }: { webhookUrl: string }) {
  const docs = buildWebhookDocumentation(webhookUrl);

  return (
    <div className="space-y-4 border-t border-border/50 pt-4">
      <p className="text-xs font-medium text-foreground">使用说明</p>

      {/* Curl example */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">请求示例</p>
        <pre className="overflow-x-auto rounded bg-accent px-3 py-2 text-xs leading-relaxed">
          {docs.example.curl}
        </pre>
      </div>

      {/* Request parameters */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">请求参数</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-left text-muted-foreground">
              <th className="pb-1.5 pr-3 font-medium">参数</th>
              <th className="pb-1.5 pr-3 font-medium">类型</th>
              <th className="pb-1.5 pr-3 font-medium">必填</th>
              <th className="pb-1.5 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(docs.body).map(([name, param]) => (
              <tr key={name} className="border-b border-border/30">
                <td className="py-1.5 pr-3 font-mono">{name}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{param.type}</td>
                <td className="py-1.5 pr-3">{param.required ? "是" : "否"}</td>
                <td className="py-1.5 text-muted-foreground">{param.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Response format */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">响应格式</p>
        <pre className="overflow-x-auto rounded bg-accent px-3 py-2 text-xs leading-relaxed">
          {JSON.stringify(
            Object.fromEntries(
              Object.entries(docs.response).map(([k, v]) => [k, `(${v.type}) ${v.description}`]),
            ),
            null,
            2,
          )}
        </pre>
      </div>

      {/* Rate limit */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">速率限制</p>
        <p className="text-xs text-muted-foreground">
          每个令牌最多 <strong className="text-foreground">{docs.rateLimit.maxRequests}</strong> 次请求 / 分钟
        </p>
      </div>

      {/* Error codes */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">错误码</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-left text-muted-foreground">
              <th className="pb-1.5 pr-3 font-medium">状态码</th>
              <th className="pb-1.5 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {docs.errors.map((err) => (
              <tr key={err.status} className="border-b border-border/30">
                <td className="py-1.5 pr-3 font-mono">{err.status}</td>
                <td className="py-1.5 text-muted-foreground">{err.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
