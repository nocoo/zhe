import { NextResponse } from "next/server";
import { verifyBackyPullWebhook } from "@/lib/db";
import { ScopedDB } from "@/lib/db/scoped";
import { APP_VERSION } from "@/lib/version";
import { getBackyEnvironment, buildBackyTag } from "@/models/backy";
import {
  buildBackupBundle,
  pushToBacky,
  fetchBackyHistory,
} from "./helpers";

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

  const result = await verifyBackyPullWebhook(key);
  if (!result) {
    return NextResponse.json(
      { error: "Invalid webhook credentials" },
      { status: 401 },
    );
  }

  const db = new ScopedDB(result.userId);
  const config = await db.getBackySettings();
  if (!config) {
    return NextResponse.json(
      { error: "Backy push config not configured" },
      { status: 422 },
    );
  }

  const start = Date.now();

  // Gather data + assemble backup envelope
  const bundle = await buildBackupBundle(db);
  const tag = buildBackyTag(APP_VERSION, {
    links: bundle.stats.links,
    folders: bundle.stats.folders,
    tags: bundle.stats.tags,
  });
  const fileName = `zhe-backup-${new Date().toISOString().slice(0, 10)}.json`;

  // Push to Backy
  const pushResult = await pushToBacky(
    config,
    bundle.json,
    fileName,
    getBackyEnvironment(),
    tag,
  );
  const durationMs = Date.now() - start;

  if (!pushResult.ok) {
    return NextResponse.json(
      {
        error: "Backup push failed",
        durationMs,
        status: pushResult.status,
        body: pushResult.body,
      },
      { status: 502 },
    );
  }

  // Best-effort: inline history fetch (non-critical)
  const history = await fetchBackyHistory(config);

  return NextResponse.json({
    ok: true,
    message: `Backup pushed successfully (${durationMs}ms)`,
    durationMs,
    tag,
    fileName,
    stats: bundle.stats,
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
  if (!key) return new Response(null, { status: 401 });
  const result = await verifyBackyPullWebhook(key);
  if (!result) return new Response(null, { status: 401 });
  return new Response(null, { status: 200 });
}
