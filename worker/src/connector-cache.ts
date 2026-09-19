import { CONNECTOR_KV_PREFIX, type ConnectorCacheOptions } from "../../models/connector-cache";
import type { Env } from "./types";

type QueryResponse = {
  success: boolean;
  results?: unknown[];
  meta?: { changes: number; last_row_id: number };
};

export async function connectorCacheKey(
  env: Env,
  sql: string,
  options: ConnectorCacheOptions,
): Promise<string | null> {
  if (!options.connectorUserId || !options.connectorCache) return null;
  try {
    // Presence is per API key and refreshed independently of job transitions.
    const version = options.connectorCache.key.startsWith("presence:")
      ? "presence"
      : await env.LINKS_KV.get(`${CONNECTOR_KV_PREFIX}version/${options.connectorUserId}`);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify([options.connectorUserId, options.connectorCache.key, sql, version]),
      ),
    );
    return `${CONNECTOR_KV_PREFIX}cache/${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  } catch (error) {
    console.error("Connector KV key failed", error);
    return null;
  }
}

export async function readConnectorCache(env: Env, key: string): Promise<QueryResponse | null> {
  try {
    const cached = await env.LINKS_KV.get<{ expiresAt: number; response: QueryResponse }>(
      key,
      "json",
    );
    // Enforce age ourselves, including a stale value returned by another KV location.
    return cached && cached.expiresAt > Date.now() ? cached.response : null;
  } catch (error) {
    console.error("Connector KV read failed", error);
    return null;
  }
}

export async function writeConnectorCache(
  env: Env,
  key: string,
  response: QueryResponse,
  ttl: number,
): Promise<void> {
  try {
    await env.LINKS_KV.put(key, JSON.stringify({ expiresAt: Date.now() + ttl * 1000, response }), {
      expirationTtl: Math.max(60, ttl),
    });
  } catch (error) {
    console.error("Connector KV write failed", error);
  }
}

export async function invalidateConnectorCache(env: Env, userId: string): Promise<void> {
  try {
    // A fresh generation also prevents an in-flight cache fill from overwriting
    // newer work. KV is a hint; periodic expiry reconciles failed/delayed writes.
    await env.LINKS_KV.put(`${CONNECTOR_KV_PREFIX}version/${userId}`, crypto.randomUUID(), {
      expirationTtl: 86400,
    });
  } catch (error) {
    console.error("Connector KV invalidation failed", error);
  }
}
