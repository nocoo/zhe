import { randomUUID } from "crypto";
import { isValidSlug } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  url: string;
  customSlug?: string;
}

export interface WebhookValidationResult {
  success: boolean;
  data?: WebhookPayload;
  error?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/** Generate a UUID v4 webhook token. */
export function generateWebhookToken(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

/** Validate an incoming webhook JSON body. */
export function validateWebhookPayload(
  payload: unknown,
): WebhookValidationResult {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { success: false, error: "payload must be a JSON object" };
  }

  const obj = payload as Record<string, unknown>;

  // url — required, must be a valid URL string
  if (typeof obj.url !== "string" || obj.url.trim() === "") {
    return { success: false, error: "url is required and must be a non-empty string" };
  }

  try {
    new URL(obj.url);
  } catch {
    return { success: false, error: "url must be a valid URL" };
  }

  // customSlug — optional
  if (obj.customSlug !== undefined) {
    if (typeof obj.customSlug !== "string") {
      return { success: false, error: "customSlug must be a string" };
    }
    if (!isValidSlug(obj.customSlug)) {
      return {
        success: false,
        error: "customSlug is invalid (1-50 alphanumeric/dash/underscore chars, no reserved paths)",
      };
    }
  }

  return {
    success: true,
    data: {
      url: obj.url,
      ...(obj.customSlug !== undefined ? { customSlug: obj.customSlug as string } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory sliding window per token
// ---------------------------------------------------------------------------

export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 60; // 60 req/min

/** Map of token → array of request timestamps (ms). */
const tokenBuckets = new Map<string, number[]>();

/**
 * Check whether a request for the given token is allowed under the rate limit.
 * Each call records the current timestamp if allowed.
 */
export function checkRateLimit(token: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = tokenBuckets.get(token);
  if (!timestamps) {
    timestamps = [];
    tokenBuckets.set(token, timestamps);
  }

  // Evict expired entries
  const firstValid = timestamps.findIndex((t) => t > windowStart);
  if (firstValid > 0) {
    timestamps.splice(0, firstValid);
  } else if (firstValid === -1) {
    timestamps.length = 0;
  }

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    // Earliest entry determines when a slot opens
    const retryAfterMs = timestamps[0] + RATE_LIMIT_WINDOW_MS - now;
    return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) };
  }

  timestamps.push(now);
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// API documentation builder
// ---------------------------------------------------------------------------

export interface WebhookDocParam {
  type: string;
  required: boolean;
  description: string;
}

export interface WebhookDocError {
  status: number;
  description: string;
}

export interface WebhookDocumentation {
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, WebhookDocParam>;
  response: Record<string, WebhookDocParam>;
  rateLimit: { maxRequests: number; windowMs: number };
  example: { curl: string };
  errors: WebhookDocError[];
}

/** Build a self-describing documentation object for the webhook API. */
export function buildWebhookDocumentation(
  webhookUrl: string,
): WebhookDocumentation {
  return {
    endpoint: webhookUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      url: {
        type: "string",
        required: true,
        description: "The original URL to shorten (must be a valid URL)",
      },
      customSlug: {
        type: "string",
        required: false,
        description:
          "Optional custom slug (1-50 alphanumeric/dash/underscore chars). Auto-generated if omitted.",
      },
    },
    response: {
      slug: {
        type: "string",
        required: true,
        description: "The generated or custom slug",
      },
      shortUrl: {
        type: "string",
        required: true,
        description: "The full short URL",
      },
      originalUrl: {
        type: "string",
        required: true,
        description: "The original URL that was shortened",
      },
    },
    rateLimit: {
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
    },
    example: {
      curl: `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/long-page"}'`,
    },
    errors: [
      { status: 400, description: "Invalid request body or slug format" },
      { status: 404, description: "Invalid webhook token" },
      { status: 409, description: "Custom slug already taken" },
      { status: 429, description: "Rate limit exceeded (60 req/min)" },
    ],
  };
}
