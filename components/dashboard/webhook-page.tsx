"use client";

import { LayerCard } from "@nocoo/basalt";
import { Button } from "@nocoo/basalt/components/button";
import { toast } from "@nocoo/basalt/components/toast";
import { Webhook } from "@nocoo/basalt/icons";
import { copyToClipboard } from "@/lib/utils";
import { useWebhookViewModel, type WebhookInitialData } from "@/viewmodels/useWebhookViewModel";
import { DashboardPageHeader } from "./page-header";
import { ApiKeyShortcut } from "./webhook-page-parts/api-key-shortcut";
import {
  CredentialRow,
  RateLimitControl,
  WebhookActions,
} from "./webhook-page-parts/webhook-controls";
import { WebhookUsageDocs } from "./webhook-page-parts/webhook-usage-docs";

async function handleCopy(text: string) {
  const ok = await copyToClipboard(text);
  if (ok) toast.success("已复制到剪贴板");
  else toast.danger("复制失败");
}

interface ConfiguredViewProps {
  token: string;
  webhookUrl: string;
  tmpUploadUrl: string | null;
  rateLimit: number;
  setRateLimit: (v: number) => void;
  isGenerating: boolean;
  isRevoking: boolean;
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
    isGenerating,
    isRevoking,
    onGenerate,
    onRevoke,
    onRateLimitChange,
  } = props;

  return (
    <div className="space-y-4" data-testid="webhook-token-section">
      <p className="text-sm text-basalt-muted-foreground">
        直接调用生成的 URL 即可收藏链接，无需登录或额外鉴权头。X 链接会先保存，再由已登录的 Zhe CLI
        Connector 自动补全。
      </p>

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
  const canMigrate = !vm.isLoading && Boolean(vm.token && vm.webhookUrl);

  return (
    <div className="space-y-basalt-layout">
      <DashboardPageHeader
        icon={Webhook}
        title="Webhook"
        description="生成一个 URL，供外部系统直接收藏网页和 X 帖子。"
        actions={
          !vm.isLoading &&
          !(vm.token && vm.webhookUrl) && (
            <Button
              onClick={vm.handleGenerate}
              disabled={vm.isGenerating}
              variant="outline"
              size="sm"
              data-testid="generate-token-btn"
            >
              {vm.isGenerating ? "生成中..." : "生成令牌"}
            </Button>
          )
        }
      />
      <ApiKeyShortcut
        isMigrating={vm.isMigrating}
        migratedApiKey={canMigrate ? vm.migratedApiKey : null}
        onMigrate={canMigrate ? vm.handleMigrate : undefined}
        onCopy={handleCopy}
      />
      <LayerCard padding="none">
        <LayerCard.Body className="px-4 py-4 md:px-5 md:py-5">
          {vm.isLoading ? (
            <p className="text-sm text-basalt-muted-foreground">加载中...</p>
          ) : vm.token && vm.webhookUrl ? (
            <ConfiguredView
              token={vm.token}
              webhookUrl={vm.webhookUrl}
              tmpUploadUrl={vm.tmpUploadUrl}
              rateLimit={vm.rateLimit}
              setRateLimit={vm.setRateLimit}
              isGenerating={vm.isGenerating}
              isRevoking={vm.isRevoking}
              onGenerate={vm.handleGenerate}
              onRevoke={vm.handleRevoke}
              onRateLimitChange={vm.handleRateLimitChange}
            />
          ) : (
            <p className="text-sm text-basalt-muted-foreground">尚未生成 Webhook 令牌。</p>
          )}
        </LayerCard.Body>
      </LayerCard>
    </div>
  );
}
