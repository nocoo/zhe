import { generateText } from "ai";
import { createUserAiModel } from "@/lib/ai/create-model";
import type { AiSettingsStored } from "@/models/ai-settings";

export type RunAiTaskFailureReason = "no_ai_config" | "ai_error" | "parse_error" | "timeout";

export type RunAiTaskResult<T> =
  | { ok: true; result: T; model: string; provider: string; durationMs: number }
  | { ok: false; reason: RunAiTaskFailureReason; message: string };

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

export async function runAiTask<T>(
  settings: AiSettingsStored,
  opts: { prompt: string; parse: (text: string) => T },
): Promise<RunAiTaskResult<T>> {
  if (!settings.provider || !settings.apiKey) {
    return { ok: false, reason: "no_ai_config", message: "AI is not configured" };
  }

  const started = Date.now();
  try {
    const model = await createUserAiModel(settings);
    const { text } = await generateText({
      model,
      prompt: opts.prompt,
      maxOutputTokens: 1024,
      abortSignal: AbortSignal.timeout(30_000),
    });
    const result = opts.parse(text);
    return {
      ok: true,
      result,
      model: settings.model ?? "",
      provider: settings.provider,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    if (isTimeout(err)) {
      return { ok: false, reason: "timeout", message: "AI request timed out" };
    }
    if (err instanceof SyntaxError || (err instanceof Error && err.name === "SuggestParseError")) {
      return { ok: false, reason: "parse_error", message: err.message };
    }
    return {
      ok: false,
      reason: "ai_error",
      message: err instanceof Error ? err.message : "Unknown AI error",
    };
  }
}
