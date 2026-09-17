import { NextResponse } from "next/server";
import { loadLinkOrgContext } from "@/lib/ai/link-context";
import { runAiTask } from "@/lib/ai/run-task";
import { LINK_ORG_SYSTEM } from "@/lib/ai/tasks/suggest-link-org";
import { getAuthContext } from "@/lib/auth-context";
import { parseSuggestLinkOrg } from "@/models/ai-suggest-link-org";
import type { SuggestEvent } from "@/models/ai-suggest-progress";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }
  const id = body && typeof body === "object" && "linkId" in body ? body.linkId : null;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
    return NextResponse.json({ error: "链接 ID 必须是正整数" }, { status: 400 });

  const { db, userId } = ctx;
  const linkId = id;
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  async function generate(send: (event: SuggestEvent) => void) {
    try {
      send({ type: "stage", stage: "prepare", message: "正在读取链接和已有来源资料" });
      const [context, settings] = await Promise.all([
        loadLinkOrgContext(db, userId, linkId),
        db.getAiSettings(),
      ]);
      if (!context) {
        send({ type: "error", reason: "not_found", message: "链接不存在" });
        return;
      }
      send({
        type: "context",
        revision: context.revision,
        supplied: context.supplied,
        notices: context.notices,
        current: {
          title: context.link.title ?? "",
          note: context.link.note ?? "",
          folderId: context.link.folderId,
          tagIds: context.assigned.map((t) => t.id),
        },
        catalogs: context.catalogs,
        historicalAnalysis: context.historicalAnalysis,
        prompt: `${LINK_ORG_SYSTEM}\n\n${context.prompt}`,
        model: settings.model ?? "",
        provider: settings.provider ?? "",
      });
      if (!settings.provider || !settings.apiKey) {
        send({ type: "error", reason: "no_ai_config", message: "请先配置 AI 供应商、模型和密钥" });
        return;
      }
      send({ type: "stage", stage: "request", message: "正在调用模型，等待整理建议" });
      const outcome = await runAiTask(settings, {
        system: LINK_ORG_SYSTEM,
        prompt: context.prompt,
        timeoutMs: 60_000,
        maxOutputTokens: 3000,
        signal,
        parse: (text) => {
          send({
            type: "stage",
            stage: "parse",
            message: "已收到回复，正在校验标题、备注和分类标签",
            rawText: text,
          });
          return parseSuggestLinkOrg(text, context.catalogs);
        },
      });
      if (!outcome.ok) {
        send({
          type: "error",
          reason: outcome.reason,
          message:
            outcome.reason === "ai_error"
              ? "模型调用失败，请检查配置；资料较长时请使用长上下文模型"
              : outcome.message,
          rawText: outcome.rawText ?? "",
        });
        return;
      }
      send({
        type: "result",
        result: outcome.result,
        durationMs: outcome.durationMs,
        rawText: outcome.rawText,
      });
    } catch {
      if (!signal.aborted)
        send({ type: "error", reason: "prepare_error", message: "读取资料失败，请重试" });
    }
  }
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
    // Legacy clients share the same task; no separate source-specific analysis path.
    const events: SuggestEvent[] = [];
    await generate((event) => events.push(event));
    const context = events.find((event) => event.type === "context");
    const result = events.find((event) => event.type === "result");
    const failure = events.find((event) => event.type === "error");
    if (failure)
      return NextResponse.json(
        { ...failure, error: failure.message, prompt: context?.prompt ?? "" },
        {
          status:
            failure.reason === "not_found"
              ? 404
              : failure.reason === "no_ai_config"
                ? 400
                : failure.reason === "timeout"
                  ? 504
                  : 502,
        },
      );
    return NextResponse.json({
      ...context,
      ...result?.result,
      rawText: result?.rawText,
      durationMs: result?.durationMs,
    });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await generate((event) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      });
      if (!abort.signal.aborted) controller.close();
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
