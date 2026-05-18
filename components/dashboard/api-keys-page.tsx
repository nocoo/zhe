"use client";

import { useState } from "react";
import { useApiKeysViewModel } from "@/viewmodels/useApiKeysViewModel";
import type { ApiScope } from "@/models/api-key";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key, Plus } from "lucide-react";
import { NewKeyBanner } from "./api-keys-page-parts/new-key-banner";
import { CreateKeyForm } from "./api-keys-page-parts/create-key-form";
import { ApiKeyRow } from "./api-keys-page-parts/api-key-row";

export function ApiKeysPage() {
  const vm = useApiKeysViewModel();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>([]);

  function toggleScope(scope: ApiScope) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function resetCreateForm() {
    setShowCreateForm(false);
    setNewKeyName("");
    setSelectedScopes([]);
  }

  async function handleCreate() {
    const result = await vm.handleCreate(newKeyName, selectedScopes);
    if (result.success) resetCreateForm();
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

          {vm.newlyCreatedKey && (
            <NewKeyBanner newKey={vm.newlyCreatedKey} onDismiss={vm.clearNewKey} />
          )}

          {vm.isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : (
            <div className="space-y-4" data-testid="api-keys-section">
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
                <CreateKeyForm
                  availableScopes={vm.availableScopes}
                  newKeyName={newKeyName}
                  setNewKeyName={setNewKeyName}
                  selectedScopes={selectedScopes}
                  toggleScope={toggleScope}
                  isCreating={vm.isCreating}
                  onCancel={resetCreateForm}
                  onCreate={handleCreate}
                />
              )}

              {vm.keys.length === 0 && !showCreateForm ? (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="no-keys-message"
                >
                  还没有 API Key。创建一个来开始使用 API。
                </p>
              ) : (
                <div className="space-y-2" data-testid="keys-list">
                  {vm.keys.map((key) => (
                    <ApiKeyRow key={key.id} apiKey={key} onRevoke={vm.handleRevoke} />
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
