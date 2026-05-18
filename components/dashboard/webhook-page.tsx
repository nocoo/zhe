"use client";

import { useWebhookViewModel, type WebhookInitialData } from "@/viewmodels/useWebhookViewModel";
import { RATE_LIMIT_ABSOLUTE_MAX } from "@/models/webhook";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Webhook, Copy, AlertTriangle, KeyRound, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/utils";
import { WebhookUsageDocs } from "./webhook-page-parts/webhook-usage-docs";

export function WebhookPage({ initialData }: { initialData?: WebhookInitialData }) {
  const {
    token,
    isLoading: webhookLoading,
    isGenerating,
    isRevoking,
    isMigrating,
    migratedApiKey,
    rateLimit,
    setRateLimit,
    webhookUrl,
    tmpUploadUrl,
    handleGenerate,
    handleRevoke,
    handleRateLimitChange,
    handleMigrate,
  } = useWebhookViewModel(initialData);

  async function handleCopy(text: string) {
    const ok = await copyToClipboard(text);
    if (ok) toast.success("已复制到剪贴板");
    else toast.error("复制失败");
  }

  return (
    <div className="space-y-6">
      <Card>
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
            <div className="space-y-4" data-testid="webhook-token-section">
              {/* Deprecation warning */}
              <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3" data-testid="webhook-deprecation-warning">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Webhook 令牌即将弃用</strong>。请创建 API Key 并更新你的集成，然后撤销 Webhook 令牌。
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      弃用日期：2026-10-01。届时 Webhook API 将停止服务。
                    </p>
                    {migratedApiKey ? (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
                          <Check className="h-4 w-4" />
                          <span>API Key 已创建！请保存以下密钥（仅显示一次）：</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-green-100 dark:bg-green-900/30 px-2 py-1 text-xs font-mono text-green-800 dark:text-green-300 break-all" data-testid="migrated-api-key">
                            {migratedApiKey}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 shrink-0"
                            onClick={() => handleCopy(migratedApiKey)}
                            aria-label="复制 API Key"
                            data-testid="copy-migrated-key-btn"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          使用方式：<code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">Authorization: Bearer {migratedApiKey.substring(0, 12)}...</code>
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          <strong>下一步：</strong>更新你的集成使用新 API Key，然后点击下方「撤销令牌」按钮停用旧 Webhook。
                        </p>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-amber-500/50 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
                        onClick={handleMigrate}
                        disabled={isMigrating}
                        data-testid="migrate-to-apikey-btn"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        {isMigrating ? "创建中..." : "创建 API Key"}
                        {!isMigrating && <ArrowRight className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Token display */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">令牌</p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-accent px-2 py-1 text-xs" data-testid="webhook-token-value">
                    {token}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleCopy(token)}
                    aria-label="复制令牌"
                    data-testid="copy-token-btn"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Webhook URL display */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Webhook URL</p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-accent px-2 py-1 text-xs break-all" data-testid="webhook-url-value">
                    {webhookUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0"
                    onClick={() => handleCopy(webhookUrl)}
                    aria-label="复制 URL"
                    data-testid="copy-url-btn"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Tmp Upload URL display */}
              {tmpUploadUrl && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Tmp Upload URL</p>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-accent px-2 py-1 text-xs break-all" data-testid="tmp-upload-url-value">
                      {tmpUploadUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0"
                      onClick={() => handleCopy(tmpUploadUrl)}
                      aria-label="复制 Tmp URL"
                      data-testid="copy-tmp-url-btn"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  variant="outline"
                  size="sm"
                  data-testid="regenerate-token-btn"
                >
                  {isGenerating ? "生成中..." : "重新生成"}
                </Button>
                <Button
                  onClick={handleRevoke}
                  disabled={isRevoking}
                  variant="outline"
                  size="sm"
                  data-testid="revoke-token-btn"
                >
                  {isRevoking ? "撤销中..." : "撤销令牌"}
                </Button>
              </div>

              {/* Rate limit slider */}
              <div className="max-w-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">速率限制</p>
                  <p className="text-xs font-medium" data-testid="rate-limit-value">
                    {rateLimit} 次/分钟
                  </p>
                </div>
                <Slider
                  data-testid="rate-limit-slider"
                  min={1}
                  max={RATE_LIMIT_ABSOLUTE_MAX}
                  step={1}
                  value={[rateLimit]}
                  onValueChange={([v]) => setRateLimit(v ?? rateLimit)}
                  onValueCommit={([v]) => handleRateLimitChange(v ?? rateLimit)}
                />
              </div>

              {/* Usage documentation */}
              <WebhookUsageDocs webhookUrl={webhookUrl} tmpUploadUrl={tmpUploadUrl} rateLimit={rateLimit} copyToClipboard={handleCopy} />
            </div>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              variant="outline"
              size="sm"
              data-testid="generate-token-btn"
            >
              {isGenerating ? "生成中..." : "生成令牌"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
