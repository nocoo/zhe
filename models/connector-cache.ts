/** Internal origin → Worker hints. Never accepted from a public API caller. */
export interface ConnectorCacheOptions {
  /** Partition cached reads; on uncached mutations, advance this owner's KV version. */
  connectorUserId?: string;
  /** Key must encode varying query parameters except time and the owner; TTL defaults to 300s. */
  connectorCache?: { key: string; ttl?: number };
}

// Slash cannot occur in a short-link slug. Link reconciliation preserves this namespace.
export const CONNECTOR_KV_PREFIX = "__connector/";
