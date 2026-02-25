"use client";

import { useBotViewModel } from "@/viewmodels/useBotViewModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Bot, Pencil, Loader2, Save } from "lucide-react";

export function BotPage() {
  const vm = useBotViewModel();

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-secondary shadow-none">
        <CardHeader className="px-4 py-3 md:px-5 md:py-4">
          <CardTitle className="flex items-center gap-3 text-sm font-medium">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
              <Bot className="h-4 w-4 text-indigo-500" strokeWidth={1.5} />
            </div>
            <span>Discord Bot</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
          <p className="mb-4 text-sm text-muted-foreground">
            配置 Discord Bot 凭据，启用后 Bot 可在频道中响应 @mention 消息。
          </p>
          <Separator className="mb-4" />

          {vm.isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : !vm.isConfigured || vm.isEditing ? (
            /* ── Config form ─────────────────────────────────────── */
            <div className="max-w-lg space-y-4">
              <div className="space-y-1">
                <Label htmlFor="bot-token" className="text-sm">
                  Bot Token
                </Label>
                <Input
                  id="bot-token"
                  data-testid="bot-token"
                  type="password"
                  placeholder="Bot Token"
                  value={vm.botToken}
                  onChange={(e) => vm.setBotToken(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bot-public-key" className="text-sm">
                  Public Key
                </Label>
                <Input
                  id="bot-public-key"
                  data-testid="bot-public-key"
                  placeholder="Ed25519 Public Key (hex)"
                  value={vm.publicKey}
                  onChange={(e) => vm.setPublicKey(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bot-application-id" className="text-sm">
                  Application ID
                </Label>
                <Input
                  id="bot-application-id"
                  data-testid="bot-application-id"
                  placeholder="Discord Application ID"
                  value={vm.applicationId}
                  onChange={(e) => vm.setApplicationId(e.target.value)}
                  className="h-9"
                />
              </div>

              {vm.error && (
                <p className="text-xs text-destructive" data-testid="bot-error">
                  {vm.error}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={vm.handleSave}
                  disabled={vm.isSaving}
                  variant="outline"
                  size="sm"
                >
                  {vm.isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  保存
                </Button>
                {vm.isEditing && (
                  <Button
                    onClick={vm.cancelEditing}
                    variant="ghost"
                    size="sm"
                  >
                    取消
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* ── Configured state ────────────────────────────────── */
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Bot Token:</span>
                <code className="rounded bg-accent px-2 py-0.5 text-xs">
                  {vm.maskedBotToken}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Public Key:</span>
                <code className="rounded bg-accent px-2 py-0.5 text-xs">
                  {vm.maskedPublicKey}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Application ID:</span>
                <code className="rounded bg-accent px-2 py-0.5 text-xs">
                  {vm.savedApplicationId}
                </code>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
