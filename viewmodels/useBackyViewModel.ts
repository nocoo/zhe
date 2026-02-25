"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getBackyConfig,
  saveBackyConfig,
  testBackyConnection,
  pushBackup,
  fetchBackyHistory,
} from "@/actions/backy";
import type { BackyHistoryResponse, BackyPushDetail } from "@/models/backy";
import { getBackyEnvironment } from "@/models/backy";

/** Return type of useBackyViewModel — can be used as a prop type */
export type BackyViewModel = ReturnType<typeof useBackyViewModel>;

/**
 * Backy viewmodel — manages remote backup config, connection testing,
 * backup push, and history retrieval.
 */
export function useBackyViewModel() {
  // Config state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Result states
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pushResult, setPushResult] = useState<BackyPushDetail | null>(null);
  const [history, setHistory] = useState<BackyHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load config (and history if configured) on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getBackyConfig();
      if (cancelled) return;
      if (result.success && result.data) {
        setWebhookUrl(result.data.webhookUrl);
        setMaskedApiKey(result.data.maskedApiKey);
        setIsConfigured(true);

        // Auto-load history when config exists
        const historyResult = await fetchBackyHistory();
        if (!cancelled && historyResult.success && historyResult.data) {
          setHistory(historyResult.data);
        }
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        setWebhookUrl(result.data.webhookUrl);
        setMaskedApiKey(result.data.maskedApiKey);
        setIsConfigured(true);
        setIsEditing(false);
        setApiKey("");
      }
    } finally {
      setIsSaving(false);
    }
  }, [webhookUrl, apiKey]);

  const handleTest = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testBackyConnection();
      setTestResult({
        ok: result.success,
        message: result.success ? "连接成功" : (result.error ?? "连接失败"),
      });
    } finally {
      setIsTesting(false);
    }
  }, []);

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    setPushResult(null);
    try {
      const result = await pushBackup();
      if (result.data) {
        setPushResult(result.data);
      } else {
        setPushResult({
          ok: false,
          message: result.error ?? "推送失败",
        });
      }
    } finally {
      setIsPushing(false);
      // Always refresh history after push (success or failure)
      const historyResult = await fetchBackyHistory();
      if (historyResult.success && historyResult.data) {
        setHistory(historyResult.data);
      }
    }
  }, []);

  const handleLoadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const result = await fetchBackyHistory();
      if (result.success && result.data) {
        setHistory(result.data);
      } else {
        setError(result.error ?? "获取历史失败");
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setApiKey("");
    setTestResult(null);
    setPushResult(null);
  }, []);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setApiKey("");
    setError(null);
  }, []);

  // Environment
  const environment = getBackyEnvironment();

  return {
    // Config
    webhookUrl,
    setWebhookUrl,
    apiKey,
    setApiKey,
    maskedApiKey,
    isConfigured,
    isEditing,
    environment,

    // Loading
    isLoading,
    isSaving,
    isTesting,
    isPushing,
    isLoadingHistory,

    // Results
    testResult,
    pushResult,
    history,
    error,

    // Actions
    handleSave,
    handleTest,
    handlePush,
    handleLoadHistory,
    startEditing,
    cancelEditing,
  };
}
