"use client";

import { Banner } from "@nocoo/basalt/components/banner";
import { Button } from "@nocoo/basalt/components/button";
import { ArrowRight, Check, Copy, KeyRound } from "@nocoo/basalt/icons";
import Link from "next/link";

interface ApiKeyShortcutProps {
  isMigrating: boolean;
  migratedApiKey: string | null;
  onMigrate: (() => void) | undefined;
  onCopy: (text: string) => void;
}

function MigratedKeyDisplay({
  apiKey,
  onCopy,
}: {
  apiKey: string;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-1 text-sm text-basalt-success">
        <Check className="h-4 w-4" />
        <span>API Key 已创建！请保存以下密钥（仅显示一次）：</span>
      </div>
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 break-all rounded-basalt-widget bg-basalt-control px-2 py-1 font-mono text-xs text-basalt-foreground"
          data-testid="migrated-api-key"
        >
          {apiKey}
        </code>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => onCopy(apiKey)}
          aria-label="复制 API Key"
          data-testid="copy-migrated-key-btn"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-basalt-muted-foreground">
        使用方式：
        <code className="bg-basalt-secondary px-1 rounded">
          Authorization: Bearer {apiKey.substring(0, 12)}...
        </code>
      </p>
      <p className="text-xs text-basalt-muted-foreground">
        <strong>下一步：</strong>在 Zhe CLI 或其他应用中使用此 API Key；Webhook URL 可继续使用。
      </p>
    </div>
  );
}

export function ApiKeyShortcut({
  isMigrating,
  migratedApiKey,
  onMigrate,
  onCopy,
}: ApiKeyShortcutProps) {
  return (
    <Banner
      size="sm"
      variant="secondary"
      title="使用 API Key"
      icon={<KeyRound strokeWidth={1.5} aria-hidden />}
      description={
        <div className="space-y-basalt-space-lg">
          <p>在 Zhe CLI 或其他应用中使用更多 API 操作，现有 Webhook URL 仍可使用。</p>
          {migratedApiKey ? <MigratedKeyDisplay apiKey={migratedApiKey} onCopy={onCopy} /> : null}
          <div className="flex flex-wrap items-center gap-basalt-space-lg">
            <Banner.Action asChild variant="secondary">
              <Link href="/dashboard/api-keys">
                前往 API Keys <ArrowRight aria-hidden />
              </Link>
            </Banner.Action>
            {onMigrate && !migratedApiKey && (
              <Banner.Action
                variant="ghost"
                onClick={onMigrate}
                disabled={isMigrating}
                data-testid="migrate-to-apikey-btn"
              >
                {isMigrating ? "创建中..." : "创建 API Key"}
              </Banner.Action>
            )}
          </div>
        </div>
      }
      data-testid="webhook-api-key-shortcut"
    />
  );
}
