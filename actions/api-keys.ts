"use server";

import { getScopedDB } from "@/lib/auth-context";
import { generateApiKey, serializeScopes, type ApiScope, API_SCOPES } from "@/models/api-key";
import { nanoid } from "nanoid";

/**
 * List all active (non-revoked) API keys for the authenticated user.
 * Returns only the prefix (never the full key or hash).
 */
export async function listApiKeys() {
  const db = await getScopedDB();
  if (!db) return { success: false as const, error: "Unauthorized" };

  const keys = await db.getApiKeys();
  return {
    success: true as const,
    data: keys.map((k) => ({
      id: k.id,
      prefix: k.prefix,
      name: k.name,
      scopes: k.scopes,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    })),
  };
}

/**
 * Create a new API key.
 * Returns the full key ONCE — it cannot be retrieved again.
 */
export async function createApiKeyAction(input: {
  name: string;
  scopes: ApiScope[];
}) {
  const db = await getScopedDB();
  if (!db) return { success: false as const, error: "Unauthorized" };

  // Validate name
  const name = input.name.trim();
  if (!name || name.length > 64) {
    return { success: false as const, error: "Name must be 1-64 characters" };
  }

  // Validate scopes
  if (!input.scopes.length) {
    return { success: false as const, error: "At least one scope is required" };
  }
  const invalidScopes = input.scopes.filter(
    (s) => !(API_SCOPES as readonly string[]).includes(s),
  );
  if (invalidScopes.length) {
    return { success: false as const, error: `Invalid scopes: ${invalidScopes.join(", ")}` };
  }

  const { fullKey, prefix, keyHash } = generateApiKey();
  const id = nanoid();

  const key = await db.createApiKey({
    id,
    prefix,
    keyHash,
    name,
    scopes: serializeScopes(input.scopes),
  });

  return {
    success: true as const,
    data: {
      id: key.id,
      prefix: key.prefix,
      name: key.name,
      scopes: key.scopes,
      createdAt: key.createdAt,
      fullKey, // Only returned on creation — never stored or returned again
    },
  };
}

/**
 * Revoke an API key (soft delete).
 */
export async function revokeApiKeyAction(id: string) {
  const db = await getScopedDB();
  if (!db) return { success: false as const, error: "Unauthorized" };

  if (!id) return { success: false as const, error: "Key ID is required" };

  const revoked = await db.revokeApiKey(id);
  if (!revoked) {
    return { success: false as const, error: "Key not found or already revoked" };
  }

  return { success: true as const };
}

/**
 * Create an API key for migrating from webhook token.
 * Creates a key with links:read and links:write scopes.
 */
export async function migrateFromWebhookAction() {
  const db = await getScopedDB();
  if (!db) return { success: false as const, error: "Unauthorized" };

  const { fullKey, prefix, keyHash } = generateApiKey();
  const id = nanoid();

  const key = await db.createApiKey({
    id,
    prefix,
    keyHash,
    name: "Migrated from Webhook",
    scopes: serializeScopes(["links:read", "links:write"]),
  });

  return {
    success: true as const,
    data: {
      id: key.id,
      prefix: key.prefix,
      name: key.name,
      scopes: key.scopes,
      createdAt: key.createdAt,
      fullKey, // Only returned on creation — never stored or returned again
    },
  };
}
