import { slidingWindowCheck } from "@/lib/api/rate-limit";
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
    const parsed = new URL(obj.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, error: "url must use http or https protocol" };
    }
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
// Rate limiting — delegates to shared sliding window
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
  const result = slidingWindowCheck(`webhook:${token}`, maxRequests, RATE_LIMIT_WINDOW_MS);
  if (!result.allowed) {
    return { allowed: false, retryAfterMs: result.retryAfterMs };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// OpenAPI 3.1 specification builder
// ---------------------------------------------------------------------------

export type { OpenApiSpec } from "./webhook-openapi";
export { buildOpenApiSpec } from "./webhook-openapi";

// ---------------------------------------------------------------------------
// AI agent prompt builder
// ---------------------------------------------------------------------------

/** Build a ready-to-copy prompt for AI agents to use the webhook API. */
export function buildAgentPrompt(
  webhookUrl: string,
  rateLimit: number = RATE_LIMIT_DEFAULT_MAX,
  tmpUploadUrl?: string,
): string {
  const tmpSection = tmpUploadUrl
    ? `

## Temporary File Upload

You also have access to a temporary file upload endpoint that shares the same token.

### Endpoint

${tmpUploadUrl}

### Usage

Upload a file via multipart/form-data with a \`file\` field:

  curl -X POST ${tmpUploadUrl} \\
    -F "file=@myfile.zip"

### Response (201 Created)

\`\`\`json
{ "key": "tmp/uuid_timestamp.zip", "url": "https://s.zhe.to/tmp/uuid_timestamp.zip", "size": 12345, "contentType": "application/zip" }
\`\`\`

### Constraints

- **Max file size**: 10 MB
- **Auto-cleanup**: Files are deleted after 1 hour
- **Rate limit**: Shared with link creation (${rateLimit} requests per minute total)`
    : "";

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
- **Auth**: The token in the URL path is the only authentication required. No additional headers needed.${tmpSection}`;
}
