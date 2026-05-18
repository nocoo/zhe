"use client";

import type { OpenApiSpec } from "@/models/webhook";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

// ---- Method / param / response tables --------------------------------------

export function MethodsTable({ spec }: { spec: OpenApiSpec }) {
  return (
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
  );
}

type PostProperty = {
  type: string;
  description?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  format?: string;
};

export function PostParamsTable({
  properties,
  required,
}: {
  properties: Record<string, PostProperty>;
  required: string[];
}) {
  return (
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
  );
}

export function ErrorCodesTable({
  responses,
}: {
  responses: Record<string, { description: string }>;
}) {
  return (
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
          {Object.entries(responses)
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
  );
}

// ---- Curl + JSON examples --------------------------------------------------

export function CurlExamples({
  webhookUrl,
  tmpUploadUrl,
}: {
  webhookUrl: string;
  tmpUploadUrl: string | null;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">请求示例</p>
        <pre className="overflow-x-auto rounded bg-accent px-3 py-2 text-xs leading-relaxed">
          {`# HEAD\ncurl -I ${webhookUrl}\n\n# GET\ncurl ${webhookUrl}\n\n# POST\ncurl -X POST ${webhookUrl} \\\n  -H "Content-Type: application/json" \\\n  -d '{"url": "https://example.com/page", "note": "Interesting article"}'`}
        </pre>
      </div>

      {tmpUploadUrl && (
        <div className="space-y-1.5" data-testid="tmp-upload-docs">
          <p className="text-xs text-muted-foreground">临时文件上传</p>
          <p className="text-xs text-muted-foreground">
            使用相同令牌上传临时文件到 R2 存储，文件在{" "}
            <strong className="text-foreground">1 小时</strong>后自动清理。最大文件大小 10 MB。
          </p>
          <pre className="overflow-x-auto rounded bg-accent px-3 py-2 text-xs leading-relaxed">
            {`# Upload a file\ncurl -X POST ${tmpUploadUrl} \\\n  -F "file=@myfile.zip"`}
          </pre>
        </div>
      )}
    </>
  );
}

export function PostResponseFormat() {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">POST 响应格式</p>
      <pre className="overflow-x-auto rounded bg-accent px-3 py-2 text-xs leading-relaxed">
        {JSON.stringify(
          {
            slug: "(string) The generated or custom slug",
            shortUrl: "(string) The full short URL",
            originalUrl: "(string) The original URL",
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
}

// ---- Static informational blocks -------------------------------------------

export function RateLimitNote({ rateLimit }: { rateLimit: number }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">速率限制</p>
      <p className="text-xs text-muted-foreground">
        每个令牌最多{" "}
        <strong className="text-foreground">{rateLimit}</strong> 次请求 /
        分钟（仅限 POST）
      </p>
    </div>
  );
}

export function BehaviorNotes() {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">行为说明</p>
      <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
        <li>
          幂等：如果同一 URL 已被缩短，返回已有链接（200）而非创建新链接（201）。此时
          customSlug、folder、note 参数被忽略。
        </li>
      </ul>
    </div>
  );
}

export function AgentPromptSection({
  agentPrompt,
  copyToClipboard,
}: {
  agentPrompt: string;
  copyToClipboard: (text: string) => void | Promise<void>;
}) {
  return (
    <div
      className="space-y-1.5 border-t border-border/50 pt-4"
      data-testid="webhook-agent-prompt"
    >
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
        将以下 Prompt 复制给 AI Agent，它将自动了解如何调用此 Webhook，并可通过 GET
        请求发现完整的 OpenAPI 3.1 Schema。
      </p>
      <pre
        className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-accent px-3 py-2 text-xs leading-relaxed"
        data-testid="agent-prompt-content"
      >
        {agentPrompt}
      </pre>
    </div>
  );
}
