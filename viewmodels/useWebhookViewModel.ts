"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getWebhookToken,
  createWebhookToken,
  revokeWebhookToken,
} from "@/actions/webhook";
import { useDashboardService } from "@/contexts/dashboard-service";

/** Return type of useWebhookViewModel — can be used as a prop type */
export type WebhookViewModel = ReturnType<typeof useWebhookViewModel>;

/**
 * Webhook viewmodel — manages webhook token state and lifecycle actions.
 */
export function useWebhookViewModel() {
  const { siteUrl } = useDashboardService();

  const [token, setToken] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
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
      }
    } finally {
      setIsRevoking(false);
    }
  }, []);

  const webhookUrl = useMemo(
    () => (token ? `${siteUrl}/api/webhook/${token}` : null),
    [siteUrl, token],
  );

  return {
    token,
    createdAt,
    isLoading,
    isGenerating,
    isRevoking,
    webhookUrl,
    handleGenerate,
    handleRevoke,
  };
}
