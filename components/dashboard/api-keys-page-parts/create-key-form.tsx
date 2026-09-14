"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_KEY_EXPIRY_DAYS, type ApiScope } from "@/models/api-key";

interface CreateKeyFormProps {
  availableScopes: readonly ApiScope[];
  newKeyName: string;
  setNewKeyName: (v: string) => void;
  selectedScopes: ApiScope[];
  toggleScope: (scope: ApiScope) => void;
  expiresInDays: number | null;
  setExpiresInDays: (days: number | null) => void;
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
  expiresInDays,
  setExpiresInDays,
  isCreating,
  onCancel,
  onCreate,
}: CreateKeyFormProps) {
  return (
    <div data-basalt-surface="" className="rounded-card p-4 space-y-4" data-testid="create-form">
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
        <Label htmlFor="key-expiry">有效期</Label>
        <Select
          value={expiresInDays === null ? "never" : String(expiresInDays)}
          onValueChange={(value) => setExpiresInDays(value === "never" ? null : Number(value))}
        >
          <SelectTrigger id="key-expiry" data-testid="key-expiry-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="never">永久有效</SelectItem>
            {API_KEY_EXPIRY_DAYS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {days} 天
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Button variant="outline" size="default" onClick={onCancel} data-testid="cancel-create-btn">
          取消
        </Button>
        <Button
          size="default"
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
