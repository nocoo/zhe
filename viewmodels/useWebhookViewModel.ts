"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getWebhookToken,
  createWebhookToken,
  revokeWebhookToken,
  updateWebhookRateLimit as updateRateLimitAction,
} from "@/actions/webhook";
import { useDashboardService } from "@/contexts/dashboard-service";
import { RATE_LIMIT_DEFAULT_MAX } from "@/models/webhook";

/** Return type of useWebhookViewModel — can be used as a prop type */
export type WebhookViewModel = ReturnType<typeof useWebhookViewModel>;

/**
 * Webhook viewmodel — manages webhook token state and lifecycle actions.
 */
export function useWebhookViewModel() {
  const { siteUrl } = useDashboardService();

  const [token, setToken] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<number>(RATE_LIMIT_DEFAULT_MAX);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  // Load token on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getWebhookToken();
      if (cancelled) return;
      if (result.success && result.data) {
        setToken(result.data.token);
        // Server actions serialize Date → string over the wire
        setCreatedAt(String(result.data.createdAt));
        setRateLimit(result.data.rateLimit ?? RATE_LIMIT_DEFAULT_MAX);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const result = await createWebhookToken();
      if (result.success && result.data) {
        setToken(result.data.token);
        setCreatedAt(String(result.data.createdAt));
        setRateLimit(result.data.rateLimit ?? RATE_LIMIT_DEFAULT_MAX);
      }
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handleRevoke = useCallback(async () => {
    setIsRevoking(true);
    try {
      const result = await revokeWebhookToken();
      if (result.success) {
        setToken(null);
        setCreatedAt(null);
        setRateLimit(RATE_LIMIT_DEFAULT_MAX);
      }
    } finally {
      setIsRevoking(false);
    }
  }, []);

  const handleRateLimitChange = useCallback(async (value: number) => {
    // Optimistic update
    setRateLimit(value);
    const result = await updateRateLimitAction(value);
    if (result.success && result.data) {
      setRateLimit(result.data.rateLimit);
    }
  }, []);

  const webhookUrl = useMemo(
    () => (token ? `${siteUrl}/api/webhook/${token}` : null),
    [siteUrl, token],
  );

  return {
    token,
    createdAt,
    rateLimit,
    isLoading,
    isGenerating,
    isRevoking,
    webhookUrl,
    handleGenerate,
    handleRevoke,
    handleRateLimitChange,
  };
}
