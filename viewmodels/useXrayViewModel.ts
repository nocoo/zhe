"use client";

import { useState, useEffect, useCallback } from "react";
import { getXrayConfig, saveXrayConfig, fetchTweet } from "@/actions/xray";
import {
  extractTweetId,
  XRAY_PRESETS,
  XRAY_DEFAULT_URL,
  type XrayTweetResponse,
} from "@/models/xray";

/** URL selection mode: a preset label or 'custom' for manual input */
export type UrlMode = (typeof XRAY_PRESETS)[number]["label"] | "custom";

/** Return type of useXrayViewModel — can be used as a prop type */
export type XrayViewModel = ReturnType<typeof useXrayViewModel>;

/**
 * Derive the UrlMode from a stored API URL.
 * If the URL matches a preset, return its label; otherwise 'custom'.
 */
function deriveUrlMode(url: string): UrlMode {
  const preset = XRAY_PRESETS.find((p) => p.url === url);
  return preset ? preset.label : "custom";
}

/**
 * xray viewmodel — manages API config, tweet fetching, and result display.
 */
export function useXrayViewModel() {
  // ── Config state ──────────────────────────────────────────────
  const [apiUrl, setApiUrl] = useState<string>(XRAY_DEFAULT_URL);
  const [urlMode, setUrlMode] = useState<UrlMode>("Production");
  const [apiToken, setApiToken] = useState("");
  const [maskedToken, setMaskedToken] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // ── Loading states ────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // ── Test input / result states ────────────────────────────────
  const [tweetInput, setTweetInput] = useState("");
  const [extractedId, setExtractedId] = useState<string | null>(null);
  const [tweetResult, setTweetResult] = useState<XrayTweetResponse | null>(
    null
  );
  const [isMockResult, setIsMockResult] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  // ── Error state ───────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Load config on mount ──────────────────────────────────────
  useEffect(() => {
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
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Live tweet ID extraction ──────────────────────────────────
  useEffect(() => {
    const id = extractTweetId(tweetInput);
    setExtractedId(id);
  }, [tweetInput]);

  // ── URL mode change handler ───────────────────────────────────
  const handleUrlModeChange = useCallback((mode: UrlMode) => {
    setUrlMode(mode);
    if (mode !== "custom") {
      const preset = XRAY_PRESETS.find((p) => p.label === mode);
      if (preset) setApiUrl(preset.url);
    }
  }, []);

  // ── Config actions ────────────────────────────────────────────
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

  // ── Fetch tweet action ────────────────────────────────────────
  const handleFetchTweet = useCallback(async () => {
    setIsFetching(true);
    setFetchError(null);
    setTweetResult(null);
    setIsMockResult(false);
    try {
      const result = await fetchTweet(tweetInput);
      if (!result.success) {
        setFetchError(result.error ?? "获取失败");
        return;
      }
      if (result.data) {
        setTweetResult(result.data);
        setIsMockResult(result.mock ?? false);
      }
    } finally {
      setIsFetching(false);
    }
  }, [tweetInput]);

  const clearResult = useCallback(() => {
    setTweetResult(null);
    setFetchError(null);
    setIsMockResult(false);
    setShowRawJson(false);
  }, []);

  const toggleRawJson = useCallback(() => {
    setShowRawJson((prev) => !prev);
  }, []);

  return {
    // Config
    apiUrl,
    setApiUrl,
    urlMode,
    handleUrlModeChange,
    apiToken,
    setApiToken,
    maskedToken,
    isConfigured,
    isEditing,

    // Loading
    isLoading,
    isSaving,
    isFetching,

    // Test
    tweetInput,
    setTweetInput,
    extractedId,
    tweetResult,
    isMockResult,
    showRawJson,

    // Errors
    error,
    fetchError,

    // Actions
    handleSave,
    startEditing,
    cancelEditing,
    handleFetchTweet,
    clearResult,
    toggleRawJson,
  };
}
