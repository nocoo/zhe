/**
 * Helpers for POST /api/backy/pull — keeps the route handler small.
 */

import { ScopedDB } from "@/lib/db/scoped";
import {
  serializeLinksForExport,
  BACKUP_SCHEMA_VERSION,
  type BackupEnvelope,
} from "@/models/settings";
import type { BackyHistoryResponse } from "@/models/backy";

export interface BackupBundle {
  envelope: BackupEnvelope;
  json: string;
  stats: {
    links: number;
    folders: number;
    tags: number;
    linkTags: number;
  };
}

/** Fetch links/folders/tags/linkTags concurrently and assemble the export envelope. */
export async function buildBackupBundle(db: ScopedDB): Promise<BackupBundle> {
  const [links, folders, tags, linkTags] = await Promise.all([
    db.getLinks(),
    db.getFolders(),
    db.getTags(),
    db.getLinkTags(),
  ]);

  const envelope: BackupEnvelope = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    links: serializeLinksForExport(links),
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
    linkTags: linkTags.map((lt) => ({ linkId: lt.linkId, tagId: lt.tagId })),
  };

  return {
    envelope,
    json: JSON.stringify(envelope),
    stats: {
      links: links.length,
      folders: folders.length,
      tags: tags.length,
      linkTags: linkTags.length,
    },
  };
}

export type PushResult =
  | { ok: true }
  | { ok: false; status: number; body: unknown };

/** Push backup JSON to the user's Backy as multipart/form-data. */
export async function pushToBacky(
  config: { webhookUrl: string; apiKey: string },
  json: string,
  fileName: string,
  environment: string,
  tag: string,
): Promise<PushResult> {
  const form = new FormData();
  form.append("file", new Blob([json], { type: "application/json" }), fileName);
  form.append("environment", environment);
  form.append("tag", tag);

  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text || null;
    }
    return { ok: false, status: res.status, body };
  }

  // Consume the success body so the socket can be reused.
  await res.json().catch(() => null);
  return { ok: true };
}

/** Best-effort: fetch the remote backup history with a 5s timeout. */
export async function fetchBackyHistory(config: {
  webhookUrl: string;
  apiKey: string;
}): Promise<BackyHistoryResponse | undefined> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const historyRes = await fetch(config.webhookUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!historyRes.ok) return undefined;
    return (await historyRes.json()) as BackyHistoryResponse;
  } catch {
    return undefined;
  }
}
