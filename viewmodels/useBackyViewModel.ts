"use client";

import { useState, useEffect } from "react";
import {
  getBackyConfig,
  fetchBackyHistory,
  getBackyPullWebhook,
} from "@/actions/backy";
import type { BackyHistoryResponse } from "@/models/backy";
import { getBackyEnvironment } from "@/models/backy";
import { useBackyConfigState } from "./backy/useBackyConfigState";
import {
  useBackyTestPush,
  useBackyHistory,
  useBackyPullWebhook,
} from "./backy/useBackyActions";

/** Initial data from SSR prefetch */
export interface BackyInitialData {
  webhookUrl?: string | undefined;
  maskedApiKey?: string | undefined;
  history?: BackyHistoryResponse | undefined;
  pullWebhook?: { key: string } | undefined;
}

export type BackyViewModel = ReturnType<typeof useBackyViewModel>;

/**
 * Backy viewmodel — composed of config, test/push, history, and pull-webhook
 * sub-hooks. Each sub-hook is independently small (<100 lines).
 */
export function useBackyViewModel(initialData?: BackyInitialData) {
  const config = useBackyConfigState({
    ...(initialData?.webhookUrl !== undefined ? { webhookUrl: initialData.webhookUrl } : {}),
    ...(initialData?.maskedApiKey !== undefined ? { maskedApiKey: initialData.maskedApiKey } : {}),
  });
  const historyHook = useBackyHistory(
    initialData?.history ?? null,
    (msg) => config.setError(msg),
  );
  const testPush = useBackyTestPush(historyHook.setHistory);
  const pull = useBackyPullWebhook(initialData?.pullWebhook?.key ?? null);

  const [isLoading, setIsLoading] = useState(!initialData);

  // Mount-load: fetch config + history + pull-webhook in parallel when no SSR data.
  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      const result = await getBackyConfig();
      if (cancelled) return;
      if (result.success && result.data) {
        config.setWebhookUrl(result.data.webhookUrl);
        config.setMaskedApiKey(result.data.maskedApiKey);
        config.setIsConfigured(true);

        const historyResult = await fetchBackyHistory();
        if (!cancelled && historyResult.success && historyResult.data) {
          historyHook.setHistory(historyResult.data);
        }
      }

      const pullResult = await getBackyPullWebhook();
      if (!cancelled && pullResult.success && pullResult.data) {
        pull.setPullKey(pullResult.data.key);
      }

      setIsLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const startEditing = () => {
    config.startEditing();
    testPush.resetResults();
  };

  const environment = getBackyEnvironment();

  return {
    // Config
    webhookUrl: config.webhookUrl,
    setWebhookUrl: config.setWebhookUrl,
    apiKey: config.apiKey,
    setApiKey: config.setApiKey,
    maskedApiKey: config.maskedApiKey,
    isConfigured: config.isConfigured,
    isEditing: config.isEditing,
    environment,

    // Loading
    isLoading,
    isSaving: config.isSaving,
    isTesting: testPush.isTesting,
    isPushing: testPush.isPushing,
    isLoadingHistory: historyHook.isLoadingHistory,

    // Results
    testResult: testPush.testResult,
    pushResult: testPush.pushResult,
    history: historyHook.history,
    error: config.error,

    // Pull webhook
    pullKey: pull.pullKey,
    isGeneratingPull: pull.isGeneratingPull,
    isRevokingPull: pull.isRevokingPull,

    // Actions
    handleSave: config.handleSave,
    handleTest: testPush.handleTest,
    handlePush: testPush.handlePush,
    handleLoadHistory: historyHook.handleLoadHistory,
    startEditing,
    cancelEditing: config.cancelEditing,
    handleGeneratePull: pull.handleGeneratePull,
    handleRevokePull: pull.handleRevokePull,
  };
}
