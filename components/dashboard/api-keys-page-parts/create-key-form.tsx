"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiScope } from "@/models/api-key";

interface CreateKeyFormProps {
  availableScopes: readonly ApiScope[];
  newKeyName: string;
  setNewKeyName: (v: string) => void;
  selectedScopes: ApiScope[];
  toggleScope: (scope: ApiScope) => void;
  isCreating: boolean;
  onCancel: () => void;
  onCreate: () => void;
}

export function CreateKeyForm({
  availableScopes,
  newKeyName,
  setNewKeyName,
  selectedScopes,
  toggleScope,
  isCreating,
  onCancel,
  onCreate,
}: CreateKeyFormProps) {
  return (
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
          {availableScopes.map((scope) => (
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
          onClick={onCancel}
          data-testid="cancel-create-btn"
        >
          取消
        </Button>
        <Button
          size="sm"
          onClick={onCreate}
          disabled={isCreating || !newKeyName.trim() || selectedScopes.length === 0}
          data-testid="create-key-btn"
        >
          {isCreating ? "创建中..." : "创建"}
        </Button>
      </div>
    </div>
  );
}
