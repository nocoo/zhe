"use client";

import { useWebhookViewModel, type WebhookInitialData } from "@/viewmodels/useWebhookViewModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Webhook } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/utils";
import { WebhookUsageDocs } from "./webhook-page-parts/webhook-usage-docs";
import { DeprecationWarning } from "./webhook-page-parts/deprecation-warning";
import {
  CredentialRow,
  WebhookActions,
  RateLimitControl,
} from "./webhook-page-parts/webhook-controls";

async function handleCopy(text: string) {
  const ok = await copyToClipboard(text);
  if (ok) toast.success("已复制到剪贴板");
  else toast.error("复制失败");
}

interface ConfiguredViewProps {
  token: string;
  webhookUrl: string;
  tmpUploadUrl: string | null;
  rateLimit: number;
  setRateLimit: (v: number) => void;
  isMigrating: boolean;
  migratedApiKey: string | null;
  isGenerating: boolean;
  isRevoking: boolean;
  onMigrate: () => void;
  onGenerate: () => void;
  onRevoke: () => void;
  onRateLimitChange: (v: number) => void;
}

function ConfiguredView(props: ConfiguredViewProps) {
  const {
    token,
    webhookUrl,
    tmpUploadUrl,
    rateLimit,
    setRateLimit,
    isMigrating,
    migratedApiKey,
    isGenerating,
    isRevoking,
    onMigrate,
    onGenerate,
    onRevoke,
    onRateLimitChange,
  } = props;

  return (
    <div className="space-y-4" data-testid="webhook-token-section">
      <DeprecationWarning
        isMigrating={isMigrating}
        migratedApiKey={migratedApiKey}
        onMigrate={onMigrate}
        onCopy={handleCopy}
      />

      <CredentialRow label="令牌" value={token} onCopy={handleCopy} testId="token" />
      <CredentialRow
        label="Webhook URL"
        value={webhookUrl}
        onCopy={handleCopy}
        testId="url"
        breakAll
      />
      {tmpUploadUrl && (
        <CredentialRow
          label="Tmp Upload URL"
          value={tmpUploadUrl}
          onCopy={handleCopy}
          testId="tmp-url"
          breakAll
        />
      )}

      <WebhookActions
        isGenerating={isGenerating}
        isRevoking={isRevoking}
        onGenerate={onGenerate}
        onRevoke={onRevoke}
      />

      <RateLimitControl
        rateLimit={rateLimit}
        setRateLimit={setRateLimit}
        onCommit={onRateLimitChange}
      />

      <WebhookUsageDocs
        webhookUrl={webhookUrl}
        tmpUploadUrl={tmpUploadUrl}
        rateLimit={rateLimit}
        copyToClipboard={handleCopy}
      />
    </div>
  );
}

export function WebhookPage({ initialData }: { initialData?: WebhookInitialData }) {
  const vm = useWebhookViewModel(initialData);

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

          {vm.isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : vm.token && vm.webhookUrl ? (
            <ConfiguredView
              token={vm.token}
              webhookUrl={vm.webhookUrl}
              tmpUploadUrl={vm.tmpUploadUrl}
              rateLimit={vm.rateLimit}
              setRateLimit={vm.setRateLimit}
              isMigrating={vm.isMigrating}
              migratedApiKey={vm.migratedApiKey}
              isGenerating={vm.isGenerating}
              isRevoking={vm.isRevoking}
              onMigrate={vm.handleMigrate}
              onGenerate={vm.handleGenerate}
              onRevoke={vm.handleRevoke}
              onRateLimitChange={vm.handleRateLimitChange}
            />
          ) : (
            <Button
              onClick={vm.handleGenerate}
              disabled={vm.isGenerating}
              variant="outline"
              size="sm"
              data-testid="generate-token-btn"
            >
              {vm.isGenerating ? "生成中..." : "生成令牌"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
