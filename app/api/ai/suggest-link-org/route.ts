import { NextResponse } from "next/server";
import { aiErrorResponse } from "@/lib/ai/errors";
import { runAiTask } from "@/lib/ai/run-task";
import { buildSuggestLinkOrgPrompt } from "@/lib/ai/tasks/suggest-link-org";
import { getAuthContext } from "@/lib/auth-context";
import type { Link } from "@/lib/db/schema";
import type { ScopedDB } from "@/lib/db/scoped";
import { refreshLinkEnrichment } from "@/lib/enrichment";
import { parseSuggestLinkOrg } from "@/models/ai-suggest-link-org";
import { linkMissingMetadata } from "@/models/links";

export const dynamic = "force-dynamic";

const METADATA_BUDGET_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

async function resolveLinkForSuggest(
  db: ScopedDB,
  userId: string,
  link: Link,
  canCallAi: boolean,
): Promise<Link> {
  if (!canCallAi || !linkMissingMetadata(link)) return link;
  try {
    await withTimeout(
      refreshLinkEnrichment(link.originalUrl, link.id, userId),
      METADATA_BUDGET_MS,
      "metadata refresh timed out",
    );
  } catch (err) {
    console.error("suggest-link-org: metadata refresh failed", err);
  }
  return (await db.getLinkById(link.id)) ?? link;
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { db, userId } = ctx;

  let body: { linkId?: unknown };
  try {
    body = (await request.json()) as { linkId?: unknown };
  } catch {
    return aiErrorResponse("请求体不是有效 JSON", "validation", 400);
  }
  if (typeof body.linkId !== "number" || !Number.isInteger(body.linkId)) {
    return aiErrorResponse("链接 ID 必须是整数", "validation", 400);
  }

  const link = await db.getLinkById(body.linkId);
  if (!link) {
    return aiErrorResponse("链接不存在", "not_found", 404);
  }

  const [folders, tags, linkTags, settings] = await Promise.all([
    db.getFolders(),
    db.getTags(),
    db.getLinkTags(),
    db.getAiSettings(),
  ]);
  const resolved = await resolveLinkForSuggest(
    db,
    userId,
    link,
    Boolean(settings.provider && settings.apiKey),
  );
  const assigned = new Set(linkTags.filter((lt) => lt.linkId === link.id).map((lt) => lt.tagId));
  const currentTags = tags.filter((t) => assigned.has(t.id)).map((t) => t.name);
  const currentFolder = folders.find((f) => f.id === resolved.folderId)?.name ?? "Inbox";

  const catalogs = {
    folders: folders.map((f) => ({ id: f.id, name: f.name })),
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
  };
  const hostname = (() => {
    try {
      return new URL(resolved.originalUrl).hostname;
    } catch {
      return resolved.originalUrl;
    }
  })();

  const prompt = buildSuggestLinkOrgPrompt({
    url: resolved.originalUrl,
    title: resolved.metaTitle || hostname,
    description: resolved.metaDescription || "",
    note: resolved.note || "",
    currentFolder: resolved.folderId ? currentFolder : "Inbox",
    currentTags: currentTags.length > 0 ? currentTags.join(", ") : "（无）",
    catalogs,
  });

  const outcome = await runAiTask(settings, {
    prompt,
    parse: (text) => parseSuggestLinkOrg(text, catalogs),
  });

  if (!outcome.ok) {
    const status =
      outcome.reason === "no_ai_config" ? 400 : outcome.reason === "timeout" ? 504 : 502;
    return NextResponse.json(
      {
        error: outcome.message,
        reason: outcome.reason,
        prompt,
        rawText: outcome.rawText ?? "",
      },
      { status },
    );
  }

  return NextResponse.json({
    folders: outcome.result.folders,
    tags: outcome.result.tags,
    note: outcome.result.note,
    catalogs,
    model: outcome.model,
    provider: outcome.provider,
    durationMs: outcome.durationMs,
    prompt,
    rawText: outcome.rawText,
  });
}
