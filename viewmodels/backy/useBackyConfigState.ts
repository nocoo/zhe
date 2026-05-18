"use client";

import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import { saveBackyConfig } from "@/actions/backy";

interface ConfigSetters {
  setWebhookUrl: Dispatch<SetStateAction<string>>;
  setApiKey: Dispatch<SetStateAction<string>>;
  setMaskedApiKey: Dispatch<SetStateAction<string | null>>;
  setIsConfigured: Dispatch<SetStateAction<boolean>>;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
}

/**
 * Config-only state slice for Backy: webhook URL + API key + masked-key +
 * edit/save flow. Exposed as a hook so other Backy concerns can use parallel
 * sub-hooks of the same shape.
 */
export function useBackyConfigState(initialData?: {
  webhookUrl?: string;
  maskedApiKey?: string;
}) {
  const [webhookUrl, setWebhookUrl] = useState(initialData?.webhookUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(
    initialData?.maskedApiKey ?? null,
  );
  const [isConfigured, setIsConfigured] = useState(!!initialData?.webhookUrl);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setters: ConfigSetters = {
    setWebhookUrl, setApiKey, setMaskedApiKey, setIsConfigured, setIsEditing,
  };

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveBackyConfig({ webhookUrl, apiKey });
      if (!result.success) {
        setError(result.error ?? "保存失败");
        return;
      }
      if (result.data) {
        setters.setWebhookUrl(result.data.webhookUrl);
        setters.setMaskedApiKey(result.data.maskedApiKey);
        setters.setIsConfigured(true);
        setters.setIsEditing(false);
        setters.setApiKey("");
      }
    } finally {
      setIsSaving(false);
    }
  }, [webhookUrl, apiKey]);

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setApiKey("");
  }, []);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setApiKey("");
    setError(null);
  }, []);

  return {
    webhookUrl, setWebhookUrl,
    apiKey, setApiKey,
    maskedApiKey, setMaskedApiKey,
    isConfigured, setIsConfigured,
    isEditing,
    isSaving,
    error,
    setError,
    handleSave,
    startEditing,
    cancelEditing,
  };
}
