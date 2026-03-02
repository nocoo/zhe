"use client";

import { useWebhookViewModel, type WebhookInitialData } from "@/viewmodels/useWebhookViewModel";
import { buildOpenApiSpec, buildAgentPrompt, RATE_LIMIT_ABSOLUTE_MAX } from "@/models/webhook";
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
            <div className="space-y-4" data-testid="webhook-token-section">
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
                    onClick={() => copyToClipboard(token)}
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
                    onClick={() => copyToClipboard(webhookUrl)}
                    aria-label="复制 URL"
                    data-testid="copy-url-btn"
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
                  onValueChange={([v]) => setRateLimit(v)}
                  onValueCommit={([v]) => handleRateLimitChange(v)}
                />
              </div>

              {/* Usage documentation */}
              <WebhookUsageDocs webhookUrl={webhookUrl} rateLimit={rateLimit} copyToClipboard={copyToClipboard} />
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

// ---------------------------------------------------------------------------
// Webhook usage documentation sub-component
// ---------------------------------------------------------------------------

function WebhookUsageDocs({
  webhookUrl,
  rateLimit,
  copyToClipboard,
}: {
  webhookUrl: string;
  rateLimit: number;
  copyToClipboard: (text: string) => void;
}) {
  const spec = buildOpenApiSpec(webhookUrl, rateLimit);
  const postOp = spec.paths["/"].post;
  const postSchema = postOp.requestBody.content["application/json"].schema;
  const properties = postSchema.properties as Record<
    string,
    { type: string; description?: string; maxLength?: number; minLength?: number; pattern?: string; format?: string }
  >;
  const required = (postSchema.required as string[]) ?? [];
  const agentPrompt = buildAgentPrompt(webhookUrl, rateLimit);

  return (
    <div className="space-y-4 border-t border-border/50 pt-4" data-testid="webhook-usage-docs">
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
            {(["head", "get", "post"] as const).map((method) => {
              const op = spec.paths["/"][method];
              return (
                <tr key={method} className="border-b border-border/30">
                  <td className="py-1.5 pr-3 font-mono">{method.toUpperCase()}</td>
                  <td className="py-1.5 text-muted-foreground">{op.summary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Curl examples */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">请求示例</p>
        <pre className="overflow-x-auto rounded bg-accent px-3 py-2 text-xs leading-relaxed">
          {`# HEAD\ncurl -I ${webhookUrl}\n\n# GET\ncurl ${webhookUrl}\n\n# POST\ncurl -X POST ${webhookUrl} \\\n  -H "Content-Type: application/json" \\\n  -d '{"url": "https://example.com/page", "note": "Interesting article"}'`}
        </pre>
      </div>

      {/* POST request parameters */}
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
            {Object.entries(properties).map(([name, prop]) => (
              <tr key={name} className="border-b border-border/30">
                <td className="py-1.5 pr-3 font-mono">{name}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{prop.type}</td>
                <td className="py-1.5 pr-3">{required.includes(name) ? "是" : "否"}</td>
                <td className="py-1.5 text-muted-foreground">{prop.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* POST response format */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">POST 响应格式</p>
        <pre className="overflow-x-auto rounded bg-accent px-3 py-2 text-xs leading-relaxed">
          {JSON.stringify(
            { slug: "(string) The generated or custom slug", shortUrl: "(string) The full short URL", originalUrl: "(string) The original URL" },
            null,
            2,
          )}
        </pre>
      </div>

      {/* Rate limit */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">速率限制</p>
        <p className="text-xs text-muted-foreground">
          每个令牌最多 <strong className="text-foreground">{rateLimit}</strong> 次请求 / 分钟（仅限 POST）
        </p>
      </div>

      {/* Behavior notes */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">行为说明</p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          <li>幂等：如果同一 URL 已被缩短，返回已有链接（200）而非创建新链接（201）。此时 customSlug、folder、note 参数被忽略。</li>
        </ul>
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
            {Object.entries(postOp.responses as Record<string, { description: string }>)
              .filter(([code]) => Number(code) >= 400)
              .map(([code, resp]) => (
                <tr key={code} className="border-b border-border/30">
                  <td className="py-1.5 pr-3 font-mono">{code}</td>
                  <td className="py-1.5 text-muted-foreground">{resp.description}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* AI Agent Prompt */}
      <div className="space-y-1.5 border-t border-border/50 pt-4" data-testid="webhook-agent-prompt">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">AI Agent Prompt</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => copyToClipboard(agentPrompt)}
            aria-label="复制 Prompt"
            data-testid="copy-agent-prompt-btn"
          >
            <Copy className="h-3 w-3" />
            复制
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          将以下 Prompt 复制给 AI Agent，它将自动了解如何调用此 Webhook，并可通过 GET 请求发现完整的 OpenAPI 3.1 Schema。
        </p>
        <pre
          className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-accent px-3 py-2 text-xs leading-relaxed"
          data-testid="agent-prompt-content"
        >
          {agentPrompt}
        </pre>
      </div>
    </div>
  );
}
