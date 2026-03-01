import { NextResponse } from "next/server";
import { verifyBackyPullWebhook } from "@/lib/db";
import { ScopedDB } from "@/lib/db/scoped";
import { APP_VERSION } from "@/lib/version";
import {
  getBackyEnvironment,
  buildBackyTag,
  type BackyHistoryResponse,
} from "@/models/backy";
import {
  serializeLinksForExport,
  BACKUP_SCHEMA_VERSION,
  type BackupEnvelope,
} from "@/models/settings";

/**
 * POST /api/backy/pull
 *
 * Webhook endpoint called by Backy to trigger a backup push.
 * Authentication via X-Webhook-Key header.
 *
 * On success, gathers all user data, pushes it to Backy, and returns 200.
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-webhook-key");

  if (!key) {
    return NextResponse.json(
      { error: "Missing X-Webhook-Key header" },
      { status: 401 },
    );
  }

  // Verify credentials
  const result = await verifyBackyPullWebhook(key);
  if (!result) {
    return NextResponse.json(
      { error: "Invalid webhook credentials" },
      { status: 401 },
    );
  }

  // Get user's Backy push config (remote webhook URL + API key)
  const db = new ScopedDB(result.userId);
  const config = await db.getBackySettings();
  if (!config) {
    return NextResponse.json(
      { error: "Backy push config not configured" },
      { status: 422 },
    );
  }

  const start = Date.now();

  // Gather data for export
  const [links, folders, tags, linkTags] = await Promise.all([
    db.getLinks(),
    db.getFolders(),
    db.getTags(),
    db.getLinkTags(),
  ]);

  const exported = serializeLinksForExport(links);
  const backupData: BackupEnvelope = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    links: exported,
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      icon: f.icon,
      createdAt: new Date(f.createdAt).toISOString(),
    })),
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      createdAt: new Date(t.createdAt).toISOString(),
    })),
    linkTags: linkTags.map((lt) => ({
      linkId: lt.linkId,
      tagId: lt.tagId,
    })),
  };
  const json = JSON.stringify(backupData);

  // Build tag
  const tag = buildBackyTag(APP_VERSION, {
    links: links.length,
    folders: folders.length,
    tags: tags.length,
  });

  const fileName = `zhe-backup-${new Date().toISOString().slice(0, 10)}.json`;

  // Push to Backy as multipart/form-data
  const form = new FormData();
  const blob = new Blob([json], { type: "application/json" });
  form.append("file", blob, fileName);
  form.append("environment", getBackyEnvironment());
  form.append("tag", tag);

  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  });

  const durationMs = Date.now() - start;

  if (!res.ok) {
    let body: unknown;
    const text = await res.text().catch(() => "");
    try {
      body = JSON.parse(text);
    } catch {
      body = text || null;
    }
    return NextResponse.json(
      {
        error: "Backup push failed",
        durationMs,
        status: res.status,
        body,
      },
      { status: 502 },
    );
  }

  // Consume response body
  await res.json().catch(() => null);

  // Fetch history inline
  let history: BackyHistoryResponse | undefined;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const historyRes = await fetch(config.webhookUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (historyRes.ok) {
      history = await historyRes.json();
    }
  } catch {
    // Non-critical
  }

  return NextResponse.json({
    ok: true,
    message: `Backup pushed successfully (${durationMs}ms)`,
    durationMs,
    tag,
    fileName,
    stats: {
      links: links.length,
      folders: folders.length,
      tags: tags.length,
      linkTags: linkTags.length,
    },
    history,
  });
}

/**
 * HEAD /api/backy/pull
 *
 * Test connection endpoint. Verifies the key is valid.
 * Returns 200 with no body on success, 401 if invalid.
 */
export async function HEAD(request: Request) {
  const key = request.headers.get("x-webhook-key");

  if (!key) {
    return new Response(null, { status: 401 });
  }

  const result = await verifyBackyPullWebhook(key);
  if (!result) {
    return new Response(null, { status: 401 });
  }

  return new Response(null, { status: 200 });
}
