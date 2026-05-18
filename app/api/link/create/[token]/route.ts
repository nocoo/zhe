import { NextResponse } from "next/server";
import { getWebhookByToken, getWebhookStats, getLinkByUserAndUrl, getFolderByUserAndName, slugExists, createLink } from "@/lib/db";
import {
  validateWebhookPayload,
  checkRateLimit,
  buildOpenApiSpec,
} from "@/models/webhook";
import { generateUniqueSlug, sanitizeSlug } from "@/lib/slug";
import { resolvePublicOrigin } from "@/lib/url";
import { kvPutLink } from "@/lib/kv/client";
import { markKVDirty } from "@/lib/kv/dirty";

/**
 * Deprecation headers for webhook-token-based API.
 *
 * This endpoint is deprecated in favor of /api/v1/links with API key auth.
 * Users should migrate to api_key-based authentication for better security
 * and more features.
 */
const DEPRECATION_HEADERS = {
  "Deprecation": "true",
  "Sunset": "2026-10-01",
  "Link": '</api/v1/links>; rel="successor-version"',
  "X-Deprecation-Notice": "This endpoint is deprecated. Migrate to /api/v1/links with API key authentication. See /dashboard/api-keys to create an API key.",
};

/**
 * HEAD /api/link/create/[token]
 *
 * Test connection endpoint. Verifies the token is valid and the webhook is
 * reachable. Returns 200 with no body on success, 404 if token is invalid.
 *
 * @deprecated Use /api/v1/links with API key authentication instead.
 */
export async function HEAD(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const webhook = await getWebhookByToken(token);
  if (!webhook) {
    return new Response(null, { status: 404, headers: DEPRECATION_HEADERS });
  }

  return new Response(null, { status: 200, headers: DEPRECATION_HEADERS });
}

/**
 * GET /api/link/create/[token]
 *
 * Returns webhook status, usage stats, and OpenAPI 3.1 specification.
 * Includes total link count, total clicks, 5 most recent links,
 * rate limit config, and full API documentation.
 *
 * @deprecated Use /api/v1/links with API key authentication instead.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const webhook = await getWebhookByToken(token);
  if (!webhook) {
    return NextResponse.json(
      { error: "Invalid webhook token" },
      { status: 404, headers: DEPRECATION_HEADERS },
    );
  }

  const webhookUrl = `${resolvePublicOrigin(request)}/api/link/create/${token}`;
  const [stats, docs] = await Promise.all([
    getWebhookStats(webhook.userId),
    Promise.resolve(buildOpenApiSpec(webhookUrl, webhook.rateLimit)),
  ]);

  return NextResponse.json(
    {
      status: "active",
      createdAt: webhook.createdAt.toISOString(),
      rateLimit: webhook.rateLimit,
      stats: {
        totalLinks: stats.totalLinks,
        totalClicks: stats.totalClicks,
        recentLinks: stats.recentLinks,
      },
      docs,
      deprecation: {
        message: "This endpoint is deprecated. Please migrate to /api/v1/links with API key authentication.",
        sunset: "2026-10-01",
        migrationGuide: "/dashboard/api-keys",
      },
    },
    { status: 200, headers: DEPRECATION_HEADERS },
  );
}

/**
 * POST /api/link/create/[token]
 *
 * Public endpoint for creating short links via webhook.
 * Authentication is via the UUID token in the URL path.
 * Rate-limited to prevent abuse (60 req/min per token).
 *
 * Request body:
 *   { url: string, customSlug?: string }
 *
 * Response (201):
 *   { slug, shortUrl, originalUrl }
 *
 * @deprecated Use POST /api/v1/links with API key authentication instead.
 */
/**
 * Parse the JSON body and validate against the webhook payload schema.
 * Returns the validated payload, or a NextResponse error to short-circuit.
 */
async function parseAndValidateBody(
  request: NextRequest,
): Promise<NextResponse | { url: string; customSlug?: string; folder?: string; note?: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: DEPRECATION_HEADERS },
    );
  }
  const validation = validateWebhookPayload(body);
  if (!validation.success || !validation.data) {
    return NextResponse.json(
      { error: validation.error ?? "Invalid payload" },
      { status: 400, headers: DEPRECATION_HEADERS },
    );
  }
  return validation.data;
}

/**
 * Resolve the final slug: validate + check availability of a custom slug,
 * or generate a unique random one. Returns NextResponse on validation
 * error / slug clash.
 */
async function resolveWebhookSlug(
  customSlug: string | undefined,
): Promise<NextResponse | { slug: string; isCustom: boolean }> {
  if (!customSlug) {
    return { slug: await generateUniqueSlug(slugExists), isCustom: false };
  }
  const sanitized = sanitizeSlug(customSlug);
  if (!sanitized) {
    return NextResponse.json(
      { error: "Invalid custom slug" },
      { status: 400, headers: DEPRECATION_HEADERS },
    );
  }
  if (await slugExists(sanitized)) {
    return NextResponse.json(
      { error: "Custom slug already taken" },
      { status: 409, headers: DEPRECATION_HEADERS },
    );
  }
  return { slug: sanitized, isCustom: true };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  // 1. Look up webhook by token
  const webhook = await getWebhookByToken(token);
  if (!webhook) {
    return NextResponse.json(
      { error: "Invalid webhook token" },
      { status: 404, headers: DEPRECATION_HEADERS },
    );
  }

  // 2. Rate limit check
  const rateResult = checkRateLimit(token, webhook.rateLimit);
  if (!rateResult.allowed) {
    const retryAfterSeconds = Math.ceil((rateResult.retryAfterMs ?? 1000) / 1000);
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { ...DEPRECATION_HEADERS, "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  // 3. Parse and validate body
  const bodyResult = await parseAndValidateBody(request);
  if (bodyResult instanceof NextResponse) return bodyResult;
  const { url, customSlug, folder, note } = bodyResult;

  // 4. Idempotency check — if same URL already exists for this user, return it
  const existingLink = await getLinkByUserAndUrl(webhook.userId, url);
  if (existingLink) {
    const origin = resolvePublicOrigin(request);
    return NextResponse.json(
      {
        slug: existingLink.slug,
        shortUrl: `${origin}/${existingLink.slug}`,
        originalUrl: existingLink.originalUrl,
      },
      { status: 200, headers: DEPRECATION_HEADERS },
    );
  }

  // 5. Resolve folder name to folderId (case-insensitive, falls back to null)
  let folderId: string | null = null;
  if (folder) {
    const matchedFolder = await getFolderByUserAndName(webhook.userId, folder);
    folderId = matchedFolder?.id ?? null;
  }

  // 6. Resolve slug
  const slugResult = await resolveWebhookSlug(customSlug);
  if (slugResult instanceof NextResponse) return slugResult;
  const { slug, isCustom } = slugResult;

  // 7. Create the link under the webhook owner's account
  const link = await createLink({
    userId: webhook.userId,
    originalUrl: url,
    slug,
    isCustom,
    folderId,
    note: note ?? null,
    clicks: 0,
  });

  // Fire-and-forget: sync to Cloudflare KV for edge redirect caching
  markKVDirty();
  void kvPutLink(link.slug, {
    id: link.id,
    originalUrl: link.originalUrl,
    expiresAt: link.expiresAt?.getTime() ?? null,
  });

  // 8. Build short URL from the public-facing origin
  const origin = resolvePublicOrigin(request);
  const shortUrl = `${origin}/${link.slug}`;

  return NextResponse.json(
    {
      slug: link.slug,
      shortUrl,
      originalUrl: link.originalUrl,
    },
    { status: 201, headers: DEPRECATION_HEADERS },
  );
}
