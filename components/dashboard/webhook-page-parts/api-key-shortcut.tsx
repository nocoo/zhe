"use client";

import { Button, LayerCard } from "@nocoo/basalt";
import { ArrowRight, Check, Copy, KeyRound } from "lucide-react";

interface ApiKeyShortcutProps {
  isMigrating: boolean;
  migratedApiKey: string | null;
  onMigrate: () => void;
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
      <div className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
        <Check className="h-4 w-4" />
        <span>API Key 已创建！请保存以下密钥（仅显示一次）：</span>
      </div>
      <div className="flex items-center gap-2">
        <code
          className="rounded bg-green-100 dark:bg-green-900/30 px-2 py-1 text-xs font-mono text-green-800 dark:text-green-300 break-all"
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
      <p className="text-xs text-muted-foreground">
        使用方式：
        <code className="bg-secondary px-1 rounded">
          Authorization: Bearer {apiKey.substring(0, 12)}...
        </code>
      </p>
      <p className="text-xs text-muted-foreground">
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
    <LayerCard.Well data-testid="webhook-api-key-shortcut">
      <div className="flex items-start gap-2">
        <div className="space-y-2">
          <p className="text-sm text-foreground">
            <strong>Webhook 持续可用</strong>
            。直接调用生成的 URL 即可收藏链接，无需登录或额外鉴权头。
          </p>
          <p className="text-xs text-muted-foreground">
            X 链接会先保存，再由已登录的 Zhe CLI Connector 自动补全。也可以创建 API Key 来使用更多
            API 操作。
          </p>
          {migratedApiKey ? (
            <MigratedKeyDisplay apiKey={migratedApiKey} onCopy={onCopy} />
          ) : (
            <Button
              variant="outline"
              size="default"
              className="gap-1.5 "
              onClick={onMigrate}
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
    </LayerCard.Well>
  );
}
