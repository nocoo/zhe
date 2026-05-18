"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RATE_LIMIT_ABSOLUTE_MAX } from "@/models/webhook";

interface CredentialRowProps {
  label: string;
  value: string;
  onCopy: (text: string) => void;
  /** test-id suffix appended to "copy-" and "-value" */
  testId: "token" | "url" | "tmp-url";
  /** Apply break-all to the code (long URLs / tokens) */
  breakAll?: boolean;
}

const TEST_ID_MAP = {
  token: { value: "webhook-token-value", copy: "copy-token-btn", ariaLabel: "复制令牌" },
  url: { value: "webhook-url-value", copy: "copy-url-btn", ariaLabel: "复制 URL" },
  "tmp-url": { value: "tmp-upload-url-value", copy: "copy-tmp-url-btn", ariaLabel: "复制 Tmp URL" },
} as const;

/** Single code-with-copy row used for token, webhook URL, tmp upload URL. */
export function CredentialRow({
  label,
  value,
  onCopy,
  testId,
  breakAll = false,
}: CredentialRowProps) {
  const ids = TEST_ID_MAP[testId];
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code
          className={`rounded bg-accent px-2 py-1 text-xs ${breakAll ? "break-all" : ""}`}
          data-testid={ids.value}
        >
          {value}
        </code>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 w-7 p-0 ${breakAll ? "shrink-0" : ""}`}
          onClick={() => onCopy(value)}
          aria-label={ids.ariaLabel}
          data-testid={ids.copy}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface WebhookActionsProps {
  isGenerating: boolean;
  isRevoking: boolean;
  onGenerate: () => void;
  onRevoke: () => void;
}

export function WebhookActions({
  isGenerating,
  isRevoking,
  onGenerate,
  onRevoke,
}: WebhookActionsProps) {
  return (
    <div className="flex gap-2">
      <Button
        onClick={onGenerate}
        disabled={isGenerating}
        variant="outline"
        size="sm"
        data-testid="regenerate-token-btn"
      >
        {isGenerating ? "生成中..." : "重新生成"}
      </Button>
      <Button
        onClick={onRevoke}
        disabled={isRevoking}
        variant="outline"
        size="sm"
        data-testid="revoke-token-btn"
      >
        {isRevoking ? "撤销中..." : "撤销令牌"}
      </Button>
    </div>
  );
}

interface RateLimitControlProps {
  rateLimit: number;
  setRateLimit: (v: number) => void;
  onCommit: (v: number) => void;
}

export function RateLimitControl({
  rateLimit,
  setRateLimit,
  onCommit,
}: RateLimitControlProps) {
  return (
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
        onValueCommit={([v]) => onCommit(v ?? rateLimit)}
      />
    </div>
  );
}
