"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FeatureCard } from "@/components/dashboard/feature-card";
import { Radar, Pencil, Loader2, Save } from "lucide-react";
import { XRAY_PRESETS } from "@/models/xray";
import { type UrlMode, type XrayViewModel } from "@/viewmodels/useXrayViewModel";

function UrlModeSelector({ vm }: { vm: XrayViewModel }) {
  const urlModes: { label: UrlMode; display: string }[] = [
    ...XRAY_PRESETS.map((p) => ({ label: p.label as UrlMode, display: p.label })),
    { label: "custom" as UrlMode, display: "Custom" },
  ];
  return (
    <div className="space-y-1">
      <Label className="text-sm">API URL</Label>
      <div className="flex flex-wrap gap-1.5">
        {urlModes.map((mode) => (
          <Button
            key={mode.label}
            variant={vm.urlMode === mode.label ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => vm.handleUrlModeChange(mode.label)}
          >
            {mode.display}
          </Button>
        ))}
      </div>
      {vm.urlMode === "custom" ? (
        <Input
          id="xray-url"
          data-testid="xray-api-url"
          placeholder="https://your-xray-api.example.com"
          value={vm.apiUrl}
          onChange={(e) => vm.setApiUrl(e.target.value)}
          className="mt-1.5 h-9"
        />
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{vm.apiUrl}</p>
      )}
    </div>
  );
}

function ConfigForm({ vm }: { vm: XrayViewModel }) {
  return (
    <div className="max-w-lg space-y-4">
      <UrlModeSelector vm={vm} />

      <div className="space-y-1">
        <Label htmlFor="xray-token" className="text-sm">API Key</Label>
        <Input
          id="xray-token"
          data-testid="xray-api-token"
          type="password"
          placeholder="输入 API Key"
          value={vm.apiToken}
          onChange={(e) => vm.setApiToken(e.target.value)}
          className="h-9"
        />
      </div>

      {vm.error && (
        <p className="text-xs text-destructive" data-testid="xray-error">
          {vm.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={vm.handleSave} disabled={vm.isSaving} variant="outline" size="sm">
          {vm.isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          保存
        </Button>
        {vm.isEditing && (
          <Button onClick={vm.cancelEditing} variant="ghost" size="sm">
            取消
          </Button>
        )}
      </div>
    </div>
  );
}

function ConfiguredView({ vm }: { vm: XrayViewModel }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">API URL:</span>
        <code className="rounded bg-accent px-2 py-0.5 text-xs break-all">{vm.apiUrl}</code>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Key:</span>
        <code className="rounded bg-accent px-2 py-0.5 text-xs">{vm.maskedToken}</code>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={vm.startEditing}
          aria-label="编辑配置"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function ConfigSection({ vm }: { vm: XrayViewModel }) {
  return (
    <FeatureCard
      icon={Radar}
      accent="info"
      title="API 配置"
      description="配置 xray API 的地址和认证 Key，用于获取 Twitter/X 帖子内容。"
    >
      {vm.isLoading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : !vm.isConfigured || vm.isEditing ? (
        <ConfigForm vm={vm} />
      ) : (
        <ConfiguredView vm={vm} />
      )}
    </FeatureCard>
  );
}
