import { generateText } from "ai";
import { createUserAiModel } from "@/lib/ai/create-model";
import type { AiSettingsStored } from "@/models/ai-settings";

export type RunAiTaskFailureReason = "no_ai_config" | "ai_error" | "parse_error" | "timeout";

export type RunAiTaskResult<T> =
  | { ok: true; result: T; model: string; provider: string; durationMs: number; rawText: string }
  | { ok: false; reason: RunAiTaskFailureReason; message: string; rawText?: string };

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

export async function runAiTask<T>(
  settings: AiSettingsStored,
  opts: { prompt: string; parse: (text: string) => T },
): Promise<RunAiTaskResult<T>> {
  if (!settings.provider || !settings.apiKey) {
    return { ok: false, reason: "no_ai_config", message: "尚未配置 AI" };
  }

  const started = Date.now();
  let rawText = "";
  try {
    const model = await createUserAiModel(settings);
    const { text } = await generateText({
      model,
      prompt: opts.prompt,
      maxOutputTokens: 1024,
      abortSignal: AbortSignal.timeout(30_000),
    });
    rawText = typeof text === "string" ? text : "";
    if (!rawText.trim()) {
      return { ok: false, reason: "parse_error", message: "模型没有返回内容", rawText };
    }
    const result = opts.parse(rawText);
    return {
      ok: true,
      result,
      model: settings.model ?? "",
      provider: settings.provider,
      durationMs: Date.now() - started,
      rawText,
    };
  } catch (err) {
    if (isTimeout(err)) {
      return { ok: false, reason: "timeout", message: "AI 请求超时" };
    }
    if (err instanceof SyntaxError) {
      return { ok: false, reason: "parse_error", message: "模型返回不是有效 JSON", rawText };
    }
    if (err instanceof Error && err.name === "SuggestParseError") {
      return { ok: false, reason: "parse_error", message: err.message, rawText };
    }
    return {
      ok: false,
      reason: "ai_error",
      message: err instanceof Error ? err.message : "AI 请求失败",
    };
  }
}
