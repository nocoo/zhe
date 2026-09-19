/**
 * API Key Database Operations
 *
 * Separated from main db/index.ts to avoid pulling Node.js crypto
 * into Edge Runtime (middleware). API keys are only used in API routes,
 * which run in Node.js runtime.
 */

import { type ApiScope, hashApiKey, parseScopes, verifyApiKey } from "@/models/api-key";
import { executeD1Query } from "./d1-client";

export type ApiKeyVerifyResult = {
  userId: string;
  keyId: string;
  keyPrefix: string;
  scopes: ApiScope[];
};

/**
 * Verify an API key and return the associated user info.
 * This is used by API route middleware, not by user-facing UI.
 *
 * Steps:
 * 1. Hash the provided key
 * 2. Look up the hash in api_keys table
 * 3. Check key is not revoked or expired
 * 4. Update last_used_at timestamp (fire-and-forget)
 * 5. Return { userId, keyId, scopes } or null
 */
export async function verifyApiKeyAndGetUser(key: string): Promise<ApiKeyVerifyResult | null> {
  const keyHash = hashApiKey(key);

  // Look up by hash (indexed column)
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT id, prefix, user_id, scopes, revoked_at, key_hash, expires_at, last_used_at
     FROM api_keys
     WHERE key_hash = ?
     LIMIT 1`,
    [keyHash],
  );

  const row = rows[0];
  if (!row) return null;

  // Verify identity before recording any rejection metadata.
  if (!verifyApiKey(key, row.key_hash as string)) return null;

  // NULL is permanent. All API key timestamps are stored in Unix seconds.
  const revoked = row.revoked_at !== null;
  const expired = row.expires_at != null && (row.expires_at as number) * 1000 <= Date.now();
  if (revoked || expired) {
    // Internal diagnostics only: never log the credential, prefix, hash, or full row.
    console.warn(
      JSON.stringify({
        event: "api_key_auth_rejected",
        keyId: row.id,
        reason: revoked ? "revoked" : "expired",
      }),
    );
    return null;
  }

  const keyId = row.id as string;
  const keyPrefix = row.prefix as string;
  const userId = row.user_id as string;
  const scopes = parseScopes(row.scopes as string);

  // Connector polling must not write usage metadata on every request.
  if (row.last_used_at == null || Number(row.last_used_at) <= Math.floor(Date.now() / 1000) - 60) {
    updateApiKeyLastUsedAt(keyId).catch(() => {
      // Silently ignore errors — this is non-critical
    });
  }

  return { userId, keyId, keyPrefix, scopes };
}

/**
 * Update the last_used_at timestamp for an API key.
 * Called by verifyApiKeyAndGetUser() as fire-and-forget.
 */
async function updateApiKeyLastUsedAt(keyId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await executeD1Query(
    `UPDATE api_keys SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at <= ?-60)`,
    [now, keyId, now],
  );
}
