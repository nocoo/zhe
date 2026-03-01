import "server-only";

import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Backy pull webhook credential generation (server-only — uses Node.js crypto)
// ---------------------------------------------------------------------------

/** Generate a UUID v4 key for identifying and authenticating the pull webhook. */
export function generatePullWebhookKey(): string {
  return randomUUID();
}
