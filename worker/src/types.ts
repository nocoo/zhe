/** Worker environment bindings — used by all sub-modules. */
export interface Env {
  LINKS_KV: KVNamespace;
  DB: D1Database;
  ORIGIN_URL: string;
  WORKER_SECRET: string;
  D1_PROXY_SECRET: string;
}

/** Minimal data stored per slug in KV — mirrors lib/kv/client.ts KVLinkData. */
export interface KVLinkData {
  id: number;
  originalUrl: string;
  expiresAt: number | null; // epoch ms, null = never expires
}
