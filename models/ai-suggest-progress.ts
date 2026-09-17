import type { SuggestCatalogs, SuggestLinkOrgResult } from "./ai-suggest-link-org";

export const SUGGEST_STEPS = [
  { id: "prepare", label: "准备资料", hint: "读取已有链接与来源资料" },
  { id: "request", label: "调用模型", hint: "等待模型返回" },
  { id: "parse", label: "校验结果", hint: "校验标题、备注、分类和标签" },
  { id: "ready", label: "待应用", hint: "可以编辑并保存建议" },
] as const;
export type SuggestStepId = (typeof SUGGEST_STEPS)[number]["id"];
export type SuggestStepState = "pending" | "current" | "done" | "error";
export type SuggestEvent =
  | { type: "stage"; stage: SuggestStepId; message: string; rawText?: string }
  | {
      type: "context";
      revision: number;
      supplied: string[];
      notices: string[];
      catalogs: SuggestCatalogs;
      current: { title: string; note: string; folderId: string | null; tagIds: string[] };
      historicalAnalysis: unknown;
      prompt: string;
      model: string;
      provider: string;
    }
  | { type: "result"; result: SuggestLinkOrgResult; durationMs: number; rawText: string }
  | { type: "error"; reason: string; message: string; rawText?: string };
export function failedSuggestStep(reason: string | undefined): SuggestStepId {
  if (reason === "parse_error") return "parse";
  if (["no_ai_config", "not_found", "validation", "prepare_error"].includes(reason ?? ""))
    return "prepare";
  return "request";
}
