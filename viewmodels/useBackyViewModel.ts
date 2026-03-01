"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getBackyConfig,
  saveBackyConfig,
  testBackyConnection,
  pushBackup,
  fetchBackyHistory,
  getBackyPullWebhook,
  generateBackyPullWebhook,
  revokeBackyPullWebhook,
} from "@/actions/backy";
import type { BackyHistoryResponse, BackyPushDetail } from "@/models/backy";
import { getBackyEnvironment } from "@/models/backy";

/** Initial data from SSR prefetch */
export interface BackyInitialData {
  webhookUrl?: string;
  maskedApiKey?: string;
  history?: BackyHistoryResponse;
  pullWebhook?: { key: string };
}

/** Return type of useBackyViewModel — can be used as a prop type */
export type BackyViewModel = ReturnType<typeof useBackyViewModel>;

/**
 * Backy viewmodel — manages remote backup config, connection testing,
 * backup push, and history retrieval.
 * When `initialData` is provided (SSR prefetch), skips the client-side config+history fetch.
 */
export function useBackyViewModel(initialData?: BackyInitialData) {
  // Config state
  const [webhookUrl, setWebhookUrl] = useState(initialData?.webhookUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(initialData?.maskedApiKey ?? null);
  const [isConfigured, setIsConfigured] = useState(!!initialData?.webhookUrl);
  const [isEditing, setIsEditing] = useState(false);

  // Loading states
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Result states
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pushResult, setPushResult] = useState<BackyPushDetail | null>(null);
  const [history, setHistory] = useState<BackyHistoryResponse | null>(initialData?.history ?? null);
  const [error, setError] = useState<string | null>(null);

  // Pull webhook state
  const [pullKey, setPullKey] = useState<string | null>(initialData?.pullWebhook?.key ?? null);
  const [isGeneratingPull, setIsGeneratingPull] = useState(false);
  const [isRevokingPull, setIsRevokingPull] = useState(false);

  // Load config (and history if configured) on mount
  useEffect(() => {
    if (initialData) return;

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

      // Load pull webhook key
      const pullResult = await getBackyPullWebhook();
      if (!cancelled && pullResult.success && pullResult.data) {
        setPullKey(pullResult.data.key);
      }

      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData]);

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
        // Use inline history from push response (avoids extra round-trip)
        if (result.data.history) {
          setHistory(result.data.history);
        }
      } else {
        setPushResult({
          ok: false,
          message: result.error ?? "推送失败",
        });
      }
    } finally {
      setIsPushing(false);
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

  // Pull webhook actions
  const handleGeneratePull = useCallback(async () => {
    setIsGeneratingPull(true);
    try {
      const result = await generateBackyPullWebhook();
      if (result.success && result.data) {
        setPullKey(result.data.key);
      }
    } finally {
      setIsGeneratingPull(false);
    }
  }, []);

  const handleRevokePull = useCallback(async () => {
    setIsRevokingPull(true);
    try {
      const result = await revokeBackyPullWebhook();
      if (result.success) {
        setPullKey(null);
      }
    } finally {
      setIsRevokingPull(false);
    }
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

    // Pull webhook
    pullKey,
    isGeneratingPull,
    isRevokingPull,

    // Actions
    handleSave,
    handleTest,
    handlePush,
    handleLoadHistory,
    startEditing,
    cancelEditing,
    handleGeneratePull,
    handleRevokePull,
  };
}
