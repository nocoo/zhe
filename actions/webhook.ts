"use server";

import { auth } from "@/auth";
import { ScopedDB } from "@/lib/db/scoped";
import { generateWebhookToken as generateToken } from "@/models/webhook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getScopedDB(): Promise<ScopedDB | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return new ScopedDB(session.user.id);
}

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
    data: { token: webhook.token, createdAt: webhook.createdAt },
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
    data: { token: webhook.token, createdAt: webhook.createdAt },
  };
}

/** Revoke the current webhook token. */
export async function revokeWebhookToken() {
  const db = await getScopedDB();
  if (!db) return { success: false as const, error: "Unauthorized" };

  await db.deleteWebhook();
  return { success: true as const };
}
