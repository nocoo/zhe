"use client";

import { AlertTriangle, ArrowRight, Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeprecationWarningProps {
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
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={() => onCopy(apiKey)}
          aria-label="复制 API Key"
          data-testid="copy-migrated-key-btn"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        使用方式：
        <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">
          Authorization: Bearer {apiKey.substring(0, 12)}...
        </code>
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        <strong>下一步：</strong>
        更新你的集成使用新 API Key，然后点击下方「撤销令牌」按钮停用旧 Webhook。
      </p>
    </div>
  );
}

export function DeprecationWarning({
  isMigrating,
  migratedApiKey,
  onMigrate,
  onCopy,
}: DeprecationWarningProps) {
  return (
    <div
      className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3"
      data-testid="webhook-deprecation-warning"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
        <div className="space-y-2">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Webhook 令牌即将弃用</strong>
            。请创建 API Key 并更新你的集成，然后撤销 Webhook 令牌。
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            弃用日期：2026-10-01。届时 Webhook API 将停止服务。
          </p>
          {migratedApiKey ? (
            <MigratedKeyDisplay apiKey={migratedApiKey} onCopy={onCopy} />
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-500/50 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
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
    </div>
  );
}
