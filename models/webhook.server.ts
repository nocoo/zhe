import "server-only";

import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Token generation (server-only — uses Node.js crypto)
// ---------------------------------------------------------------------------

/** Generate a UUID v4 webhook token. */
export function generateWebhookToken(): string {
  return randomUUID();
}
