import { NextResponse } from "next/server";
import { aiErrorResponse } from "@/lib/ai/errors";
import { runAiTask } from "@/lib/ai/run-task";
import { buildSuggestLinkOrgPrompt } from "@/lib/ai/tasks/suggest-link-org";
import { getScopedDB } from "@/lib/auth-context";
import { parseSuggestLinkOrg } from "@/models/ai-suggest-link-org";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const db = await getScopedDB();
  if (!db) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const assigned = new Set(linkTags.filter((lt) => lt.linkId === link.id).map((lt) => lt.tagId));
  const currentTags = tags.filter((t) => assigned.has(t.id)).map((t) => t.name);
  const currentFolder = folders.find((f) => f.id === link.folderId)?.name ?? "Inbox";

  const catalogs = {
    folders: folders.map((f) => ({ id: f.id, name: f.name })),
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
  };
  const hostname = (() => {
    try {
      return new URL(link.originalUrl).hostname;
    } catch {
      return link.originalUrl;
    }
  })();

  const prompt = buildSuggestLinkOrgPrompt({
    url: link.originalUrl,
    title: link.metaTitle || hostname,
    description: link.metaDescription || "",
    note: link.note || "",
    currentFolder: link.folderId ? currentFolder : "Inbox",
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
    return aiErrorResponse(outcome.message, outcome.reason, status);
  }

  return NextResponse.json({
    folders: outcome.result.folders,
    tags: outcome.result.tags,
    model: outcome.model,
    provider: outcome.provider,
    durationMs: outcome.durationMs,
  });
}
