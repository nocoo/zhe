"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getDiscordBotConfig,
  saveDiscordBotConfig,
} from "@/actions/bot";

/** Return type of useBotViewModel — can be used as a prop type */
export type BotViewModel = ReturnType<typeof useBotViewModel>;

/**
 * Bot viewmodel — manages Discord bot config (token, public key, app ID).
 */
export function useBotViewModel() {
  // Config state
  const [botToken, setBotToken] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [maskedBotToken, setMaskedBotToken] = useState<string | null>(null);
  const [maskedPublicKey, setMaskedPublicKey] = useState<string | null>(null);
  const [savedApplicationId, setSavedApplicationId] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Result states
  const [error, setError] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getDiscordBotConfig();
      if (cancelled) return;
      if (result.success && result.data) {
        setMaskedBotToken(result.data.maskedBotToken);
        setMaskedPublicKey(result.data.maskedPublicKey);
        setSavedApplicationId(result.data.applicationId);
        setIsConfigured(true);
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
      const result = await saveDiscordBotConfig({
        botToken,
        publicKey,
        applicationId,
      });
      if (!result.success) {
        setError(result.error ?? "保存失败");
        return;
      }
      if (result.data) {
        setMaskedBotToken(result.data.maskedBotToken);
        setMaskedPublicKey(result.data.maskedPublicKey);
        setSavedApplicationId(result.data.applicationId);
        setIsConfigured(true);
        setIsEditing(false);
        setBotToken("");
        setPublicKey("");
        setApplicationId("");
      }
    } finally {
      setIsSaving(false);
    }
  }, [botToken, publicKey, applicationId]);

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setBotToken("");
    setPublicKey("");
    setApplicationId("");
    setError(null);
  }, []);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setBotToken("");
    setPublicKey("");
    setApplicationId("");
    setError(null);
  }, []);

  return {
    // Config
    botToken,
    setBotToken,
    publicKey,
    setPublicKey,
    applicationId,
    setApplicationId,
    maskedBotToken,
    maskedPublicKey,
    savedApplicationId,
    isConfigured,
    isEditing,

    // Loading
    isLoading,
    isSaving,

    // Results
    error,

    // Actions
    handleSave,
    startEditing,
    cancelEditing,
  };
}
