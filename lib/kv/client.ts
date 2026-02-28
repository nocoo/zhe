/**
 * Cloudflare KV HTTP API client for link redirect caching.
 *
 * Stores a minimal { id, originalUrl, expiresAt } payload per slug in KV,
 * enabling a future Cloudflare Worker to resolve redirects at the edge
 * without hitting the D1 HTTP API.
 *
 * Design principles:
 * - All operations are **fire-and-forget safe**: failures are logged, never thrown.
 * - When CLOUDFLARE_KV_NAMESPACE_ID is absent (local dev), every function
 *   silently returns without performing any I/O.
 * - Every fetch uses AbortSignal.timeout to prevent hung requests.
 */

/** Timeout for KV HTTP API requests (ms). */
const KV_FETCH_TIMEOUT_MS = 3_000;

/** Minimal data stored per slug in KV — only what the redirect Worker needs. */
export interface KVLinkData {
  id: number;
  originalUrl: string;
  expiresAt: number | null; // epoch ms, null = never expires
}

// ─── Credentials ────────────────────────────────────────────────────────────

interface KVCredentials {
  accountId: string;
  namespaceId: string;
  token: string;
}

/**
 * Returns KV credentials if fully configured, or null otherwise.
 * Null means "KV is not configured" (e.g. local dev) — callers should
 * silently skip any KV operations.
 */
function getKVCredentials(): KVCredentials | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !namespaceId || !token) return null;

  return { accountId, namespaceId, token };
}

/** Build the KV REST API base URL for a given key. */
function kvUrl(creds: KVCredentials, key: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/storage/kv/namespaces/${creds.namespaceId}/values/${encodeURIComponent(key)}`;
}

/** Standard Cloudflare API auth headers. */
function kvHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Check whether the KV namespace is configured in the current environment. */
export function isKVConfigured(): boolean {
  return getKVCredentials() !== null;
}

/**
 * Write (or overwrite) a link entry in KV.
 * Safe to call in local dev — silently returns if KV is not configured.
 */
export async function kvPutLink(slug: string, data: KVLinkData): Promise<void> {
  const creds = getKVCredentials();
  if (!creds) return;

  try {
    const response = await fetch(kvUrl(creds, slug), {
      method: 'PUT',
      headers: {
        ...kvHeaders(creds.token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(KV_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`KV put failed for slug "${slug}":`, response.status, text);
    }
  } catch (err) {
    console.error(`KV put error for slug "${slug}":`, err);
  }
}

/**
 * Delete a link entry from KV.
 * Safe to call in local dev — silently returns if KV is not configured.
 */
export async function kvDeleteLink(slug: string): Promise<void> {
  const creds = getKVCredentials();
  if (!creds) return;

  try {
    const response = await fetch(kvUrl(creds, slug), {
      method: 'DELETE',
      headers: kvHeaders(creds.token),
      signal: AbortSignal.timeout(KV_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`KV delete failed for slug "${slug}":`, response.status, text);
    }
  } catch (err) {
    console.error(`KV delete error for slug "${slug}":`, err);
  }
}

/**
 * Read a link entry from KV. Returns null if not found or KV is not configured.
 * Primarily used by the sync script to verify consistency.
 */
export async function kvGetLink(slug: string): Promise<KVLinkData | null> {
  const creds = getKVCredentials();
  if (!creds) return null;

  try {
    const response = await fetch(kvUrl(creds, slug), {
      method: 'GET',
      headers: kvHeaders(creds.token),
      signal: AbortSignal.timeout(KV_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    return (await response.json()) as KVLinkData;
  } catch (err) {
    console.error(`KV get error for slug "${slug}":`, err);
    return null;
  }
}

/**
 * Bulk-write multiple link entries to KV in a single API call.
 * Cloudflare supports up to 10,000 key-value pairs per bulk write.
 * Used by the full sync script/cron.
 */
export async function kvBulkPutLinks(
  entries: Array<{ slug: string; data: KVLinkData }>,
): Promise<{ success: number; failed: number }> {
  const creds = getKVCredentials();
  if (!creds) return { success: 0, failed: 0 };
  if (entries.length === 0) return { success: 0, failed: 0 };

  const BATCH_SIZE = 10_000;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const payload = batch.map((e) => ({
      key: e.slug,
      value: JSON.stringify(e.data),
    }));

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/storage/kv/namespaces/${creds.namespaceId}/bulk`,
        {
          method: 'PUT',
          headers: {
            ...kvHeaders(creds.token),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(KV_FETCH_TIMEOUT_MS * 3), // bulk needs more time
        },
      );

      if (response.ok) {
        success += batch.length;
      } else {
        const text = await response.text();
        console.error(`KV bulk put failed (batch ${i / BATCH_SIZE}):`, response.status, text);
        failed += batch.length;
      }
    } catch (err) {
      console.error(`KV bulk put error (batch ${i / BATCH_SIZE}):`, err);
      failed += batch.length;
    }
  }

  return { success, failed };
}
