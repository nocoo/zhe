import { NextResponse } from "next/server";
import { getWebhookByToken, getLinkByUserAndUrl, getFolderByUserAndName, slugExists, createLink } from "@/lib/db";
import {
  validateWebhookPayload,
  checkRateLimit,
  buildWebhookDocumentation,
} from "@/models/webhook";
import { generateUniqueSlug, sanitizeSlug } from "@/lib/slug";

/**
 * GET /api/webhook/[token]
 *
 * Self-documentation endpoint. Returns a JSON object describing how to use
 * the webhook API, including parameters, curl examples, and error codes.
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
      { status: 404 },
    );
  }

  const webhookUrl = `${new URL(request.url).origin}/api/webhook/${token}`;
  const docs = buildWebhookDocumentation(webhookUrl, webhook.rateLimit);

  return NextResponse.json(docs, { status: 200 });
}

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
  const rateResult = checkRateLimit(token, webhook.rateLimit);
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

  const { url, customSlug, folder } = validation.data;

  // 4. Idempotency check — if same URL already exists for this user, return it
  const existingLink = await getLinkByUserAndUrl(webhook.userId, url);
  if (existingLink) {
    const origin = new URL(request.url).origin;
    return NextResponse.json(
      {
        slug: existingLink.slug,
        shortUrl: `${origin}/${existingLink.slug}`,
        originalUrl: existingLink.originalUrl,
      },
      { status: 200 },
    );
  }

  // 5. Resolve folder name to folderId (case-insensitive, falls back to null)
  let folderId: string | null = null;
  if (folder) {
    const matchedFolder = await getFolderByUserAndName(webhook.userId, folder);
    folderId = matchedFolder?.id ?? null;
  }

  // 6. Resolve slug
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

  // 7. Create the link under the webhook owner's account
  const link = await createLink({
    userId: webhook.userId,
    originalUrl: url,
    slug,
    isCustom,
    folderId,
    clicks: 0,
  });

  // 8. Build short URL from the request origin
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
