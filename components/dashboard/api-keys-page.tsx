"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { ApiScope } from "@/models/api-key";
import { useApiKeysViewModel } from "@/viewmodels/useApiKeysViewModel";
import { ApiKeyRow } from "./api-keys-page-parts/api-key-row";
import { CreateKeyForm } from "./api-keys-page-parts/create-key-form";
import { NewKeyBanner } from "./api-keys-page-parts/new-key-banner";
import { ConnectorPanel } from "./connector-panel";

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
      <PageHeader title="API Keys" description="管理外部应用访问数据的密钥。" />
      <Card>
        <CardContent className="px-4 py-4 md:px-5 md:py-5">
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
                  size="default"
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
                <p className="text-sm text-muted-foreground" data-testid="no-keys-message">
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
      <ConnectorPanel />
    </div>
  );
}
