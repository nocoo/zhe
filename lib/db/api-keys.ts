/**
 * API Key Database Operations
 *
 * Separated from main db/index.ts to avoid pulling Node.js crypto
 * into Edge Runtime (middleware). API keys are only used in API routes,
 * which run in Node.js runtime.
 */

import { executeD1Query } from './d1-client';
import { hashApiKey, verifyApiKey, parseScopes, type ApiScope } from '@/models/api-key';

export type ApiKeyVerifyResult = {
  userId: string;
  keyId: string;
  scopes: ApiScope[];
};

/**
 * Verify an API key and return the associated user info.
 * This is used by API route middleware, not by user-facing UI.
 *
 * Steps:
 * 1. Hash the provided key
 * 2. Look up the hash in api_keys table
 * 3. Check key is not revoked
 * 4. Update last_used_at timestamp (fire-and-forget)
 * 5. Return { userId, keyId, scopes } or null
 */
export async function verifyApiKeyAndGetUser(
  key: string,
): Promise<ApiKeyVerifyResult | null> {
  const keyHash = hashApiKey(key);

  // Look up by hash (indexed column)
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT id, user_id, scopes, revoked_at, key_hash
     FROM api_keys
     WHERE key_hash = ?
     LIMIT 1`,
    [keyHash],
  );

  const row = rows[0];
  if (!row) return null;

  // Check not revoked
  if (row.revoked_at !== null) return null;

  // Verify hash (constant-time comparison)
  if (!verifyApiKey(key, row.key_hash as string)) return null;

  const keyId = row.id as string;
  const userId = row.user_id as string;
  const scopes = parseScopes(row.scopes as string);

  // Update last_used_at (fire-and-forget, don't block the response)
  updateApiKeyLastUsedAt(keyId).catch(() => {
    // Silently ignore errors — this is non-critical
  });

  return { userId, keyId, scopes };
}

/**
 * Update the last_used_at timestamp for an API key.
 * Called by verifyApiKeyAndGetUser() as fire-and-forget.
 */
async function updateApiKeyLastUsedAt(keyId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await executeD1Query(
    `UPDATE api_keys SET last_used_at = ? WHERE id = ?`,
    [now, keyId],
  );
}
