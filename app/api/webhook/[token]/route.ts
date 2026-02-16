import { NextResponse } from "next/server";
import { getWebhookByToken, slugExists, createLink } from "@/lib/db";
import { validateWebhookPayload, checkRateLimit } from "@/models/webhook";
import { generateUniqueSlug, sanitizeSlug } from "@/lib/slug";

/**
 * POST /api/webhook/[token]
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
 */
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
      { status: 404 },
    );
  }

  // 2. Rate limit check
  const rateResult = checkRateLimit(token);
  if (!rateResult.allowed) {
    const retryAfterSeconds = Math.ceil((rateResult.retryAfterMs ?? 1000) / 1000);
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  // 3. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const validation = validateWebhookPayload(body);
  if (!validation.success || !validation.data) {
    return NextResponse.json(
      { error: validation.error ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const { url, customSlug } = validation.data;

  // 4. Resolve slug
  let slug: string;
  let isCustom = false;

  if (customSlug) {
    const sanitized = sanitizeSlug(customSlug);
    if (!sanitized) {
      return NextResponse.json(
        { error: "Invalid custom slug" },
        { status: 400 },
      );
    }

    const exists = await slugExists(sanitized);
    if (exists) {
      return NextResponse.json(
        { error: "Custom slug already taken" },
        { status: 409 },
      );
    }

    slug = sanitized;
    isCustom = true;
  } else {
    slug = await generateUniqueSlug(slugExists);
  }

  // 5. Create the link under the webhook owner's account
  const link = await createLink({
    userId: webhook.userId,
    originalUrl: url,
    slug,
    isCustom,
    folderId: null,
    clicks: 0,
  });

  // 6. Build short URL from the request origin
  const origin = new URL(request.url).origin;
  const shortUrl = `${origin}/${link.slug}`;

  return NextResponse.json(
    {
      slug: link.slug,
      shortUrl,
      originalUrl: link.originalUrl,
    },
    { status: 201 },
  );
}
