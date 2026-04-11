"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listApiKeys,
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/actions/api-keys";
import type { ApiScope } from "@/models/api-key";
import { API_SCOPES } from "@/models/api-key";

export interface ApiKeyListItem {
  id: string;
  prefix: string;
  name: string;
  scopes: string;
  createdAt: Date | null;
  lastUsedAt: Date | null;
}

export type ApiKeysViewModel = ReturnType<typeof useApiKeysViewModel>;

export function useApiKeysViewModel() {
  const [keys, setKeys] = useState<ApiKeyListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  // Load keys on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listApiKeys();
      if (cancelled) return;
      if (result.success) {
        setKeys(result.data);
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = useCallback(async (name: string, scopes: ApiScope[]) => {
    setIsCreating(true);
    try {
      const result = await createApiKeyAction({ name, scopes });
      if (result.success) {
        setNewlyCreatedKey(result.data.fullKey);
        // Refresh list
        const listResult = await listApiKeys();
        if (listResult.success) setKeys(listResult.data);
      }
      return result;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const handleRevoke = useCallback(async (id: string) => {
    const result = await revokeApiKeyAction(id);
    if (result.success) {
      setKeys((prev) => prev.filter((k) => k.id !== id));
    }
    return result;
  }, []);

  const clearNewKey = useCallback(() => {
    setNewlyCreatedKey(null);
  }, []);

  return {
    keys,
    isLoading,
    isCreating,
    newlyCreatedKey,
    handleCreate,
    handleRevoke,
    clearNewKey,
    availableScopes: API_SCOPES,
  };
}
