import { isValidSlug } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  url: string;
  customSlug?: string;
  folder?: string;
  note?: string;
}

export const WEBHOOK_NOTE_MAX_LENGTH = 500;

export interface WebhookValidationResult {
  success: boolean;
  data?: WebhookPayload;
  error?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/** Summary stats returned by GET /api/link/create/[token]. */
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

  // note — optional, non-empty string, max WEBHOOK_NOTE_MAX_LENGTH chars
  if (obj.note !== undefined) {
    if (typeof obj.note !== "string") {
      return { success: false, error: "note must be a string" };
    }
    if (obj.note.trim() === "") {
      return { success: false, error: "note must be a non-empty string" };
    }
    if (obj.note.length > WEBHOOK_NOTE_MAX_LENGTH) {
      return { success: false, error: `note must be at most ${WEBHOOK_NOTE_MAX_LENGTH} characters` };
    }
  }

  return {
    success: true,
    data: {
      url: obj.url,
      ...(obj.customSlug !== undefined ? { customSlug: obj.customSlug as string } : {}),
      ...(obj.folder !== undefined ? { folder: (obj.folder as string).trim() } : {}),
      ...(obj.note !== undefined ? { note: (obj.note as string).trim() } : {}),
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
// OpenAPI 3.1 specification builder
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export type OpenApiSpec = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Build an OpenAPI 3.1.0 specification for the webhook API. */
export function buildOpenApiSpec(
  webhookUrl: string,
  maxRequests: number = RATE_LIMIT_DEFAULT_MAX,
): OpenApiSpec {
  return {
    openapi: "3.1.0",
    info: {
      title: "zhe.to Webhook API",
      version: "1.0.0",
      description: "Create short links via webhook. Authentication is via UUID token in the URL path.",
    },
    servers: [{ url: webhookUrl }],
    paths: {
      "/": {
        head: {
          summary: "Test connection",
          description: "Returns 200 if the token is valid, 404 otherwise. No response body.",
          responses: {
            "200": { description: "Token is valid" },
            "404": { description: "Invalid webhook token" },
          },
        },
        get: {
          summary: "Get status, stats & API schema",
          description: "Retrieve webhook status, usage stats, and this OpenAPI specification.",
          responses: {
            "200": {
              description: "Webhook info with stats and OpenAPI docs",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", description: "Webhook status (\"active\")" },
                      createdAt: { type: "string", format: "date-time", description: "When the webhook was created" },
                      rateLimit: { type: "integer", description: "Requests per minute" },
                      stats: {
                        type: "object",
                        properties: {
                          totalLinks: { type: "integer" },
                          totalClicks: { type: "integer" },
                          recentLinks: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                slug: { type: "string" },
                                originalUrl: { type: "string", format: "uri" },
                                clicks: { type: "integer" },
                                createdAt: { type: "string", format: "date-time" },
                              },
                            },
                          },
                        },
                      },
                      docs: { type: "object", description: "This OpenAPI 3.1 specification" },
                    },
                  },
                },
              },
            },
            "404": { description: "Invalid webhook token" },
          },
        },
        post: {
          summary: "Create a short link",
          description: `Create a short link. Rate-limited to ${maxRequests} requests per minute.`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: {
                      type: "string",
                      format: "uri",
                      description: "The original URL to shorten (must be a valid URL)",
                    },
                    customSlug: {
                      type: "string",
                      minLength: 1,
                      maxLength: 50,
                      pattern: "^[a-zA-Z0-9_-]+$",
                      description: "Optional custom slug. Auto-generated if omitted. Must not be a reserved path.",
                    },
                    folder: {
                      type: "string",
                      minLength: 1,
                      maxLength: 50,
                      description: "Optional folder name (case-insensitive match). Left uncategorized if not found.",
                    },
                    note: {
                      type: "string",
                      minLength: 1,
                      maxLength: WEBHOOK_NOTE_MAX_LENGTH,
                      description: "Optional bookmark note or comment.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Short link created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      slug: { type: "string", description: "The generated or custom slug" },
                      shortUrl: { type: "string", format: "uri", description: "The full short URL" },
                      originalUrl: { type: "string", format: "uri", description: "The original URL" },
                    },
                  },
                },
              },
            },
            "200": {
              description: "URL already shortened — existing link returned (idempotent)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      slug: { type: "string" },
                      shortUrl: { type: "string", format: "uri" },
                      originalUrl: { type: "string", format: "uri" },
                    },
                  },
                },
              },
            },
            "400": { description: "Invalid request body or slug format" },
            "404": { description: "Invalid webhook token" },
            "409": { description: "Custom slug already taken" },
            "429": { description: `Rate limit exceeded (${maxRequests} req/min)` },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// AI agent prompt builder
// ---------------------------------------------------------------------------

/** Build a ready-to-copy prompt for AI agents to use the webhook API. */
export function buildAgentPrompt(
  webhookUrl: string,
  rateLimit: number = RATE_LIMIT_DEFAULT_MAX,
): string {
  return `You have access to a URL shortener webhook API.

## Endpoint

${webhookUrl}

## Schema Discovery

To discover the full API schema (all parameters, types, constraints, and
response formats), send a GET request to the endpoint above. The response
JSON includes a \`docs\` field containing a standard OpenAPI 3.1 specification:

  curl ${webhookUrl}

Parse \`response.docs.paths["/"].post.requestBody.content["application/json"].schema.properties\`
to enumerate all available parameters and their constraints programmatically.

## Quick Reference

Send a POST request with a JSON body:

  curl -X POST ${webhookUrl} \\
    -H "Content-Type: application/json" \\
    -d '{"url": "https://example.com/page", "note": "Interesting article"}'

### Parameters

| Parameter  | Type   | Required | Constraint           | Description                                   |
|------------|--------|----------|----------------------|-----------------------------------------------|
| url        | string | yes      | valid URL            | The original URL to shorten                   |
| customSlug | string | no       | 1-50 chars, [a-zA-Z0-9_-] | Custom slug. Auto-generated if omitted.  |
| folder     | string | no       | max 50 chars         | Folder name (case-insensitive match)          |
| note       | string | no       | max ${WEBHOOK_NOTE_MAX_LENGTH} chars        | Bookmark note or comment                      |

### Response (201 Created)

\`\`\`json
{ "slug": "abc123", "shortUrl": "https://zhe.to/abc123", "originalUrl": "https://example.com/page" }
\`\`\`

## Behavior

- **Idempotent**: If the same URL was already shortened, the existing link is returned (200) instead of creating a duplicate (201). When this happens, customSlug, folder, and note are ignored.
- **Rate limit**: ${rateLimit} requests per minute.
- **Auth**: The token in the URL path is the only authentication required. No additional headers needed.`;
}
