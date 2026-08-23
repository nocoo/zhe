import { generateText } from "ai";
import { NextResponse } from "next/server";
import { createUserAiModel } from "@/lib/ai/create-model";
import { aiErrorResponse } from "@/lib/ai/errors";
import { getScopedDB } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const db = await getScopedDB();
  if (!db) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stored = await db.getAiSettings();
  if (!stored.provider || !stored.apiKey) {
    return aiErrorResponse("请先配置供应商和密钥", "no_ai_config", 400);
  }

  try {
    const model = await createUserAiModel(stored);
    const { text } = await generateText({
      model,
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 10,
    });
    return NextResponse.json({
      success: true,
      response: text.trim(),
      model: stored.model ?? "",
      provider: stored.provider,
    });
  } catch (err) {
    type UpstreamError = Error & { statusCode?: number; responseBody?: string; url?: string };
    const e = err as UpstreamError;
    const statusCode = typeof e.statusCode === "number" ? e.statusCode : 502;
    let detail = e.message ?? "未知错误";
    if (e.responseBody) {
      try {
        const parsed = JSON.parse(e.responseBody) as {
          error?: { message?: string } | string;
          message?: string;
        };
        const inner =
          typeof parsed.error === "string"
            ? parsed.error
            : (parsed.error?.message ?? parsed.message);
        if (inner) detail = inner;
      } catch {
        // keep base message
      }
    }
    return aiErrorResponse(e.url ? `${detail}（上游：${e.url}）` : detail, "ai_error", statusCode);
  }
}
