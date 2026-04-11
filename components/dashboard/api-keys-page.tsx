"use client";

import { useState } from "react";
import { useApiKeysViewModel } from "@/viewmodels/useApiKeysViewModel";
import type { ApiScope } from "@/models/api-key";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Key, Copy, Plus, Trash2 } from "lucide-react";

export function ApiKeysPage() {
  const vm = useApiKeysViewModel();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>([]);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  function toggleScope(scope: ApiScope) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  async function handleCreate() {
    const result = await vm.handleCreate(newKeyName, selectedScopes);
    if (result.success) {
      setShowCreateForm(false);
      setNewKeyName("");
      setSelectedScopes([]);
    }
  }

  function formatDate(date: Date | null): string {
    if (!date) return "从未使用";
    return new Date(date).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="px-4 py-3 md:px-5 md:py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Key className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
          <p className="mb-4 text-sm text-muted-foreground">
            管理 API 密钥，用于外部应用程序访问您的数据。
          </p>

          {/* Newly created key warning banner */}
          {vm.newlyCreatedKey && (
            <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4" data-testid="new-key-banner">
              <p className="mb-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                请立即复制此密钥。关闭后将无法再次查看。
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-accent px-2 py-1 text-xs break-all" data-testid="new-key-value">
                  {vm.newlyCreatedKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={() => vm.newlyCreatedKey && copyToClipboard(vm.newlyCreatedKey)}
                  data-testid="copy-new-key-btn"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={vm.clearNewKey}
                  data-testid="dismiss-new-key-btn"
                >
                  关闭
                </Button>
              </div>
            </div>
          )}

          {vm.isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : (
            <div className="space-y-4" data-testid="api-keys-section">
              {/* Create button or form */}
              {!showCreateForm ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateForm(true)}
                  data-testid="show-create-form-btn"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  创建 API Key
                </Button>
              ) : (
                <div className="rounded-lg border p-4 space-y-4" data-testid="create-form">
                  <div className="space-y-2">
                    <Label htmlFor="key-name">名称</Label>
                    <Input
                      id="key-name"
                      placeholder="例如：CLI 工具"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      data-testid="key-name-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>权限范围</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {vm.availableScopes.map((scope) => (
                        <div key={scope} className="flex items-center space-x-2">
                          <Checkbox
                            id={`scope-${scope}`}
                            checked={selectedScopes.includes(scope)}
                            onCheckedChange={() => toggleScope(scope)}
                            data-testid={`scope-${scope}`}
                          />
                          <label
                            htmlFor={`scope-${scope}`}
                            className="text-sm text-muted-foreground cursor-pointer"
                          >
                            {scope}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewKeyName("");
                        setSelectedScopes([]);
                      }}
                      data-testid="cancel-create-btn"
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreate}
                      disabled={vm.isCreating || !newKeyName.trim() || selectedScopes.length === 0}
                      data-testid="create-key-btn"
                    >
                      {vm.isCreating ? "创建中..." : "创建"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Keys list */}
              {vm.keys.length === 0 && !showCreateForm ? (
                <p className="text-sm text-muted-foreground" data-testid="no-keys-message">
                  还没有 API Key。创建一个来开始使用 API。
                </p>
              ) : (
                <div className="space-y-2" data-testid="keys-list">
                  {vm.keys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                      data-testid={`key-item-${key.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{key.name}</span>
                          <code className="text-xs text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
                            {key.prefix}...
                          </code>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {key.scopes.split(",").map((scope) => (
                            <Badge key={scope} variant="secondary" className="text-[10px]">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          <span>创建于 {formatDate(key.createdAt)}</span>
                          <span>
                            最后使用 {key.lastUsedAt ? formatDate(key.lastUsedAt) : "从未使用"}
                          </span>
                        </div>
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            data-testid={`revoke-key-${key.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            撤销
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>撤销 API Key</AlertDialogTitle>
                            <AlertDialogDescription>
                              确定要撤销此 API Key 吗？此操作不可撤消，使用此密钥的所有应用将立即失去访问权限。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => vm.handleRevoke(key.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              data-testid={`confirm-revoke-${key.id}`}
                            >
                              撤销
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
