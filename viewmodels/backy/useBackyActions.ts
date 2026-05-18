"use client";

import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import {
  testBackyConnection,
  pushBackup,
  fetchBackyHistory,
  generateBackyPullWebhook,
  revokeBackyPullWebhook,
} from "@/actions/backy";
import type { BackyHistoryResponse, BackyPushDetail } from "@/models/backy";

/** Connection test + manual push state, with results. */
export function useBackyTestPush(setHistory: Dispatch<SetStateAction<BackyHistoryResponse | null>>) {
  const [isTesting, setIsTesting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pushResult, setPushResult] = useState<BackyPushDetail | null>(null);

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
        if (result.data.history) setHistory(result.data.history);
      } else {
        setPushResult({ ok: false, message: result.error ?? "推送失败" });
      }
    } finally {
      setIsPushing(false);
    }
  }, [setHistory]);

  const resetResults = useCallback(() => {
    setTestResult(null);
    setPushResult(null);
  }, []);

  return {
    isTesting, isPushing,
    testResult, pushResult,
    handleTest, handlePush,
    resetResults,
  };
}

/** History list with explicit refresh action. */
export function useBackyHistory(
  initial: BackyHistoryResponse | null,
  onError: (msg: string) => void,
) {
  const [history, setHistory] = useState<BackyHistoryResponse | null>(initial);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const handleLoadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const result = await fetchBackyHistory();
      if (result.success && result.data) setHistory(result.data);
      else onError(result.error ?? "获取历史失败");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [onError]);

  return { history, setHistory, isLoadingHistory, handleLoadHistory };
}

/** Backy pull-webhook key generation / revocation. */
export function useBackyPullWebhook(initialKey: string | null) {
  const [pullKey, setPullKey] = useState<string | null>(initialKey);
  const [isGeneratingPull, setIsGeneratingPull] = useState(false);
  const [isRevokingPull, setIsRevokingPull] = useState(false);

  const handleGeneratePull = useCallback(async () => {
    setIsGeneratingPull(true);
    try {
      const result = await generateBackyPullWebhook();
      if (result.success && result.data) setPullKey(result.data.key);
    } finally {
      setIsGeneratingPull(false);
    }
  }, []);

  const handleRevokePull = useCallback(async () => {
    setIsRevokingPull(true);
    try {
      const result = await revokeBackyPullWebhook();
      if (result.success) setPullKey(null);
    } finally {
      setIsRevokingPull(false);
    }
  }, []);

  return {
    pullKey, setPullKey,
    isGeneratingPull, isRevokingPull,
    handleGeneratePull, handleRevokePull,
  };
}
