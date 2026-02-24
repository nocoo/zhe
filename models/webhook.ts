import { isValidSlug } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  url: string;
  customSlug?: string;
  folder?: string;
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

/** Summary stats returned by GET /api/webhook/[token]. */
export interface WebhookStats {
  totalLinks: number;
  totalClicks: number;
  recentLinks: WebhookRecentLink[];
}

export interface WebhookRecentLink {
  slug: string;
  originalUrl: string;
  clicks: number;
  createdAt: string; // ISO 8601
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

  // folder — optional, non-empty string, max 50 chars
  if (obj.folder !== undefined) {
    if (typeof obj.folder !== "string") {
      return { success: false, error: "folder must be a string" };
    }
    if (obj.folder.trim() === "") {
      return { success: false, error: "folder must be a non-empty string" };
    }
    if (obj.folder.length > 50) {
      return { success: false, error: "folder must be at most 50 characters" };
    }
  }

  return {
    success: true,
    data: {
      url: obj.url,
      ...(obj.customSlug !== undefined ? { customSlug: obj.customSlug as string } : {}),
      ...(obj.folder !== undefined ? { folder: (obj.folder as string).trim() } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory sliding window per token
// ---------------------------------------------------------------------------

export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const RATE_LIMIT_DEFAULT_MAX = 5; // default: 5 req/min
export const RATE_LIMIT_ABSOLUTE_MAX = 10; // hard cap: 10 req/min

/** Clamp a rate limit value to [1, RATE_LIMIT_ABSOLUTE_MAX]. */
export function clampRateLimit(value: number): number {
  return Math.max(1, Math.min(RATE_LIMIT_ABSOLUTE_MAX, Math.round(value)));
}

/** Validate that a rate limit value is within the allowed range. */
export function isValidRateLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= RATE_LIMIT_ABSOLUTE_MAX;
}

/** Map of token → array of request timestamps (ms). */
const tokenBuckets = new Map<string, number[]>();

/**
 * Check whether a request for the given token is allowed under the rate limit.
 * Each call records the current timestamp if allowed.
 */
/**
 * Check whether a request for the given token is allowed under the rate limit.
 * Each call records the current timestamp if allowed.
 *
 * @param token  The webhook token
 * @param maxRequests  Per-token limit (defaults to RATE_LIMIT_DEFAULT_MAX)
 */
export function checkRateLimit(
  token: string,
  maxRequests: number = RATE_LIMIT_DEFAULT_MAX,
): RateLimitResult {
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

  if (timestamps.length >= maxRequests) {
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

export interface WebhookMethodDoc {
  method: string;
  description: string;
  headers?: Record<string, string>;
  body?: Record<string, WebhookDocParam>;
  response?: Record<string, WebhookDocParam>;
  example?: { curl: string };
}

export interface WebhookDocumentation {
  endpoint: string;
  methods: WebhookMethodDoc[];
  rateLimit: { maxRequests: number; windowMs: number };
  notes: string[];
  errors: WebhookDocError[];
}

/** Build a self-describing documentation object for the webhook API. */
export function buildWebhookDocumentation(
  webhookUrl: string,
  maxRequests: number = RATE_LIMIT_DEFAULT_MAX,
): WebhookDocumentation {
  return {
    endpoint: webhookUrl,
    methods: [
      {
        method: "HEAD",
        description: "Test connection. Returns 200 if the token is valid, 404 otherwise. No response body.",
        example: {
          curl: `curl -I ${webhookUrl}`,
        },
      },
      {
        method: "GET",
        description: "Retrieve webhook status, usage stats (total links, total clicks, recent links), and API documentation.",
        response: {
          status: {
            type: "string",
            required: true,
            description: "Webhook status (\"active\")",
          },
          createdAt: {
            type: "string",
            required: true,
            description: "ISO 8601 timestamp of when the webhook was created",
          },
          rateLimit: {
            type: "number",
            required: true,
            description: "Current rate limit (requests per minute)",
          },
          stats: {
            type: "object",
            required: true,
            description: "Usage stats: totalLinks, totalClicks, recentLinks[]",
          },
          docs: {
            type: "object",
            required: true,
            description: "This documentation object",
          },
        },
        example: {
          curl: `curl ${webhookUrl}`,
        },
      },
      {
        method: "POST",
        description: "Create a short link. Rate-limited.",
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
          folder: {
            type: "string",
            required: false,
            description:
              "Optional folder name (case-insensitive match). Link is placed in the matched folder, or left uncategorized if not found.",
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
        example: {
          curl: `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/long-page"}'`,
        },
      },
    ],
    rateLimit: {
      maxRequests,
      windowMs: RATE_LIMIT_WINDOW_MS,
    },
    notes: [
      "Idempotent: if the same URL has already been shortened under your account, the existing short link is returned (200) instead of creating a duplicate (201).",
      "When an existing link is returned, the customSlug and folder parameters are ignored.",
    ],
    errors: [
      { status: 400, description: "Invalid request body or slug format" },
      { status: 404, description: "Invalid webhook token" },
      { status: 409, description: "Custom slug already taken" },
      { status: 429, description: `Rate limit exceeded (${maxRequests} req/min)` },
    ],
  };
}
