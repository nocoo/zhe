"use server";

import { getScopedDB } from "@/lib/auth-context";
import { generateWebhookToken as generateToken } from "@/models/webhook.server";
import {
  clampRateLimit,
  isValidRateLimit,
  RATE_LIMIT_DEFAULT_MAX,
} from "@/models/webhook";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Get the current webhook token for the authenticated user. */
export async function getWebhookToken() {
  const db = await getScopedDB();
  if (!db) return { success: false as const, error: "Unauthorized" };

  const webhook = await db.getWebhook();
  if (!webhook) return { success: true as const, data: null };

  return {
    success: true as const,
    data: {
      token: webhook.token,
      createdAt: webhook.createdAt,
      rateLimit: webhook.rateLimit ?? RATE_LIMIT_DEFAULT_MAX,
    },
  };
}

/** Generate a new webhook token (replaces existing). */
export async function createWebhookToken() {
  const db = await getScopedDB();
  if (!db) return { success: false as const, error: "Unauthorized" };

  const token = generateToken();
  const webhook = await db.upsertWebhook(token);

  return {
    success: true as const,
    data: {
      token: webhook.token,
      createdAt: webhook.createdAt,
      rateLimit: webhook.rateLimit ?? RATE_LIMIT_DEFAULT_MAX,
    },
  };
}

/** Revoke the current webhook token. */
export async function revokeWebhookToken() {
  const db = await getScopedDB();
  if (!db) return { success: false as const, error: "Unauthorized" };

  await db.deleteWebhook();
  return { success: true as const };
}

/** Update the rate limit for the authenticated user's webhook. */
export async function updateWebhookRateLimit(value: number) {
  const db = await getScopedDB();
  if (!db) return { success: false as const, error: "Unauthorized" };

  if (!isValidRateLimit(value)) {
    return { success: false as const, error: "Rate limit must be between 1 and 10" };
  }

  const clamped = clampRateLimit(value);
  const webhook = await db.updateWebhookRateLimit(clamped);
  if (!webhook) return { success: false as const, error: "No webhook found" };

  return {
    success: true as const,
    data: { rateLimit: webhook.rateLimit },
  };
}
