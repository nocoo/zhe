"use client";

import { useWebhookViewModel, type WebhookInitialData } from "@/viewmodels/useWebhookViewModel";
import { buildWebhookDocumentation, RATE_LIMIT_ABSOLUTE_MAX } from "@/models/webhook";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Webhook, Copy } from "lucide-react";

export function WebhookPage({ initialData }: { initialData?: WebhookInitialData }) {
  const {
    token,
    isLoading: webhookLoading,
    isGenerating,
    isRevoking,
    rateLimit,
    setRateLimit,
    webhookUrl,
    handleGenerate,
    handleRevoke,
    handleRateLimitChange,
  } = useWebhookViewModel(initialData);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="space-y-6">
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
                  onValueChange={([v]) => setRateLimit(v)}
                  onValueCommit={([v]) => handleRateLimitChange(v)}
                />
              </div>

              {/* Usage documentation */}
              <WebhookUsageDocs webhookUrl={webhookUrl} rateLimit={rateLimit} />
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

function WebhookUsageDocs({ webhookUrl, rateLimit }: { webhookUrl: string; rateLimit: number }) {
  const docs = buildWebhookDocumentation(webhookUrl, rateLimit);
  const postMethod = docs.methods.find((m) => m.method === "POST");

  return (
    <div className="space-y-4 border-t border-border/50 pt-4">
      <p className="text-xs font-medium text-foreground">使用说明</p>

      {/* Supported methods */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">支持的方法</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-left text-muted-foreground">
              <th className="pb-1.5 pr-3 font-medium">方法</th>
              <th className="pb-1.5 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {docs.methods.map((m) => (
              <tr key={m.method} className="border-b border-border/30">
                <td className="py-1.5 pr-3 font-mono">{m.method}</td>
                <td className="py-1.5 text-muted-foreground">{m.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Curl examples */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">请求示例</p>
        <pre className="overflow-x-auto rounded bg-accent px-3 py-2 text-xs leading-relaxed">
          {docs.methods
            .filter((m) => m.example)
            .map((m) => `# ${m.method}\n${m.example!.curl}`)
            .join("\n\n")}
        </pre>
      </div>

      {/* POST request parameters */}
      {postMethod?.body && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">POST 请求参数</p>
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
              {Object.entries(postMethod.body).map(([name, param]) => (
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
      )}

      {/* POST response format */}
      {postMethod?.response && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">POST 响应格式</p>
          <pre className="overflow-x-auto rounded bg-accent px-3 py-2 text-xs leading-relaxed">
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(postMethod.response).map(([k, v]) => [k, `(${v.type}) ${v.description}`]),
              ),
              null,
              2,
            )}
          </pre>
        </div>
      )}

      {/* Rate limit */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">速率限制</p>
        <p className="text-xs text-muted-foreground">
          每个令牌最多 <strong className="text-foreground">{docs.rateLimit.maxRequests}</strong> 次请求 / 分钟（仅限 POST）
        </p>
      </div>

      {/* Notes */}
      {docs.notes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">行为说明</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {docs.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

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
