import "server-only";

import { randomBytes, randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Backy pull webhook credential generation (server-only — uses Node.js crypto)
// ---------------------------------------------------------------------------

/** Generate a UUID v4 key for identifying the pull webhook. */
export function generatePullWebhookKey(): string {
  return randomUUID();
}

/** Generate a 32-byte hex secret for authenticating pull webhook requests. */
export function generatePullWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}
