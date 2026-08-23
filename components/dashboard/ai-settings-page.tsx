"use client";

import { Loader2, Plug, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CUSTOM_MODEL_VALUE, useAiSettingsViewModel } from "@/viewmodels/useAiSettingsViewModel";

export function AiSettingsPage() {
  const vm = useAiSettingsViewModel();

  return (
    <div data-testid="ai-settings-page">
      <PageHeader title="AI" description="配置大模型供应商，用于链接整理建议。" />

      {!vm.loaded ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="max-w-xl space-y-4">
          <div className="space-y-1">
            <Label htmlFor="ai-provider">供应商</Label>
            <Select
              {...(vm.settings.provider ? { value: vm.settings.provider } : {})}
              onValueChange={vm.handleProviderChange}
            >
              <SelectTrigger id="ai-provider" data-testid="ai-provider">
                <SelectValue placeholder="选择供应商" />
              </SelectTrigger>
              <SelectContent>
                {vm.providerOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {vm.isCustomProvider ? (
            <div className="space-y-1">
              <Label htmlFor="ai-model">模型</Label>
              <Input
                id="ai-model"
                data-testid="ai-model"
                value={vm.settings.model}
                onChange={(e) => vm.setSettings((s) => ({ ...s, model: e.target.value }))}
                placeholder="输入模型名"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="ai-model">模型</Label>
              {vm.presetModels.length > 0 && !vm.isCustomModel ? (
                <Select
                  value={
                    vm.presetModels.includes(vm.settings.model)
                      ? vm.settings.model
                      : CUSTOM_MODEL_VALUE
                  }
                  onValueChange={vm.handleModelSelect}
                >
                  <SelectTrigger id="ai-model" data-testid="ai-model">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {vm.presetModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_MODEL_VALUE}>自定义模型…</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-1">
                  <Input
                    id="ai-model"
                    data-testid="ai-model"
                    value={vm.customModelInput}
                    onChange={(e) => {
                      vm.setCustomModelInput(e.target.value);
                      vm.setSettings((s) => ({ ...s, model: e.target.value }));
                    }}
                    placeholder="输入模型名"
                  />
                  {vm.presetModels.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="使用预设模型"
                      onClick={() => {
                        vm.setIsCustomModel(false);
                        vm.setCustomModelInput("");
                        vm.setSettings((s) => ({ ...s, model: vm.presetModels[0] ?? "" }));
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {vm.isCustomProvider && (
            <>
              <div className="space-y-1">
                <Label htmlFor="ai-base-url">接口地址</Label>
                <Input
                  id="ai-base-url"
                  data-testid="ai-base-url"
                  value={vm.settings.baseURL}
                  onChange={(e) => vm.setSettings((s) => ({ ...s, baseURL: e.target.value }))}
                  placeholder="https://api.example.com/v1"
                />
                <p className="text-xs text-muted-foreground">
                  OpenAI 兼容网关通常需要以 /v1 结尾。点「测试连接」做最终校验。
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ai-sdk-type">协议</Label>
                  <Select
                    {...(vm.settings.sdkType ? { value: vm.settings.sdkType } : {})}
                    onValueChange={(value) => vm.setSettings((s) => ({ ...s, sdkType: value }))}
                  >
                    <SelectTrigger id="ai-sdk-type" data-testid="ai-sdk-type">
                      <SelectValue placeholder="选择协议" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ai-auth-type">鉴权</Label>
                  <Select
                    {...(vm.settings.authType ? { value: vm.settings.authType } : {})}
                    onValueChange={(value) => vm.setSettings((s) => ({ ...s, authType: value }))}
                  >
                    <SelectTrigger id="ai-auth-type" data-testid="ai-auth-type">
                      <SelectValue placeholder="选择鉴权" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apiKey">密钥</SelectItem>
                      <SelectItem value="bearer">Bearer 令牌</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label htmlFor="ai-api-key">密钥</Label>
            <Input
              id="ai-api-key"
              data-testid="ai-api-key"
              type="password"
              value={vm.apiKeyInput}
              onChange={(e) => vm.setApiKeyInput(e.target.value)}
              placeholder={
                vm.settings.hasApiKey ? `已保存 ···${vm.settings.apiKeyLast4}` : "输入密钥"
              }
            />
          </div>

          {vm.testStatus === "error" && vm.testError && (
            <p className="text-xs text-destructive" data-testid="ai-test-error">
              {vm.testError}
            </p>
          )}
          {vm.testStatus === "success" && (
            <p className="text-xs text-success" data-testid="ai-test-success">
              连接成功
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void vm.handleSave()}
              disabled={!vm.canSubmit || vm.saving}
              data-testid="ai-save"
            >
              {vm.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              保存
            </Button>
            <Button
              size="sm"
              onClick={() => void vm.handleTest()}
              disabled={!vm.canSubmit || vm.saving || vm.testStatus === "testing"}
              data-testid="ai-test"
            >
              {vm.testStatus === "testing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Plug className="mr-2 h-4 w-4" />
              测试连接
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
