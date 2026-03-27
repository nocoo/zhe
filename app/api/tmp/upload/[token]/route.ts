import { NextResponse } from "next/server";
import { getWebhookByToken } from "@/lib/db";
import { checkRateLimit } from "@/models/webhook";
import { uploadBufferToR2 } from "@/lib/r2/client";
import { MAX_FILE_SIZE } from "@/models/upload";

/** Extract file extension from a filename (lowercase, no dot). */
function extractExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || dot === filename.length - 1) return "bin";
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * POST /api/tmp/upload/[token]
 *
 * Upload a temporary file to R2. The file is stored at `tmp/<uuid>_<timestamp>.<ext>`
 * and publicly accessible at `${R2_PUBLIC_DOMAIN}/tmp/<uuid>_<timestamp>.<ext>`.
 *
 * Files are ephemeral: a cleanup timer deletes anything older than 1 hour.
 *
 * Authentication is via the same webhook token used for link creation.
 * Rate-limited identically to the link creation endpoint.
 *
 * Request: multipart/form-data with a `file` field.
 * Response (201): { key, url, size, contentType }
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

  // 2. Rate limit check (shared with link creation)
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

  // 3. Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field in form data" },
      { status: 400 },
    );
  }

  // 4. Validate file size
  if (file.size === 0) {
    return NextResponse.json(
      { error: "File is empty" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB` },
      { status: 413 },
    );
  }

  // 5. Build R2 key: tmp/<uuid>_<timestamp>.<ext>
  const ext = extractExtension(file.name || "file.bin");
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  const key = `tmp/${uuid}_${timestamp}.${ext}`;

  // 6. Upload to R2
  const buffer = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  try {
    await uploadBufferToR2(key, buffer, contentType);
  } catch (err) {
    console.error("Failed to upload tmp file to R2:", err);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }

  // 7. Build public download URL
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  if (!publicDomain) {
    return NextResponse.json(
      { error: "R2_PUBLIC_DOMAIN environment variable is required" },
      { status: 500 },
    );
  }
  const url = `${publicDomain}/${key}`;

  return NextResponse.json(
    { key, url, size: file.size, contentType },
    { status: 201 },
  );
}

/**
 * GET /api/tmp/upload/[token]
 *
 * Returns endpoint info and usage docs.
 */
export async function GET(
  _request: Request,
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

  return NextResponse.json({
    status: "active",
    description: "Temporary file upload endpoint. Files are deleted after 1 hour.",
    maxFileSize: `${MAX_FILE_SIZE / (1024 * 1024)} MB`,
    rateLimit: webhook.rateLimit,
    usage: {
      method: "POST",
      contentType: "multipart/form-data",
      field: "file",
      example: `curl -X POST https://zhe.to/api/tmp/upload/${token} -F "file=@myfile.zip"`,
    },
  });
}

/**
 * HEAD /api/tmp/upload/[token]
 *
 * Connection test — verifies the token is valid.
 */
export async function HEAD(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const webhook = await getWebhookByToken(token);
  if (!webhook) {
    return new Response(null, { status: 404 });
  }

  return new Response(null, { status: 200 });
}
