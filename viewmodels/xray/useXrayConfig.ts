"use client";

import { useState, useEffect, useCallback } from "react";
import { getXrayConfig, saveXrayConfig } from "@/actions/xray";
import { XRAY_PRESETS, XRAY_DEFAULT_URL } from "@/models/xray";

export type UrlMode = (typeof XRAY_PRESETS)[number]["label"] | "custom";

export function deriveUrlMode(url: string): UrlMode {
  const preset = XRAY_PRESETS.find((p) => p.url === url);
  return preset ? preset.label : "custom";
}

export interface XrayInitialData {
  apiUrl: string;
  maskedToken: string;
}

/** Config state + actions for the Xray API (URL, token, save/edit). */
export function useXrayConfig(initialData?: XrayInitialData) {
  const [apiUrl, setApiUrl] = useState<string>(initialData?.apiUrl ?? XRAY_DEFAULT_URL);
  const [urlMode, setUrlMode] = useState<UrlMode>(
    initialData ? deriveUrlMode(initialData.apiUrl) : "Production",
  );
  const [apiToken, setApiToken] = useState("");
  const [maskedToken, setMaskedToken] = useState<string | null>(initialData?.maskedToken ?? null);
  const [isConfigured, setIsConfigured] = useState(!!initialData);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      const result = await getXrayConfig();
      if (cancelled) return;
      if (result.success && result.data) {
        setApiUrl(result.data.apiUrl);
        setUrlMode(deriveUrlMode(result.data.apiUrl));
        setMaskedToken(result.data.maskedToken);
        setIsConfigured(true);
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [initialData]);

  const handleUrlModeChange = useCallback((mode: UrlMode) => {
    setUrlMode(mode);
    if (mode !== "custom") {
      const preset = XRAY_PRESETS.find((p) => p.label === mode);
      if (preset) setApiUrl(preset.url);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveXrayConfig({ apiUrl, apiToken });
      if (!result.success) {
        setError(result.error ?? "保存失败");
        return;
      }
      if (result.data) {
        setApiUrl(result.data.apiUrl);
        setUrlMode(deriveUrlMode(result.data.apiUrl));
        setMaskedToken(result.data.maskedToken);
        setIsConfigured(true);
        setIsEditing(false);
        setApiToken("");
      }
    } finally {
      setIsSaving(false);
    }
  }, [apiUrl, apiToken]);

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setApiToken("");
    setError(null);
  }, []);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setApiToken("");
    setError(null);
  }, []);

  return {
    apiUrl, setApiUrl,
    urlMode, handleUrlModeChange,
    apiToken, setApiToken,
    maskedToken,
    isConfigured,
    isEditing,
    isLoading,
    isSaving,
    error,
    handleSave,
    startEditing,
    cancelEditing,
  };
}
