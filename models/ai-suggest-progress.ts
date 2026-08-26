export const SUGGEST_STEPS = [
  { id: "prepare", label: "准备目录", hint: "读取链接、文件夹和标签" },
  { id: "request", label: "调用模型", hint: "正在等待模型返回" },
  { id: "parse", label: "解析结果", hint: "校验文件夹和标签 JSON" },
  { id: "ready", label: "完成", hint: "可以核对并应用建议" },
] as const;

export type SuggestStepId = (typeof SUGGEST_STEPS)[number]["id"];
export type SuggestStepState = "pending" | "current" | "done" | "error";

export function failedSuggestStep(reason: string | undefined): SuggestStepId {
  if (reason === "parse_error") return "parse";
  if (reason === "no_ai_config" || reason === "not_found" || reason === "validation") {
    return "prepare";
  }
  return "request";
}

export function suggestStepState(
  id: SuggestStepId,
  loading: boolean,
  error: string,
  failedStep: SuggestStepId | null,
): SuggestStepState {
  const order: SuggestStepId[] = ["prepare", "request", "parse", "ready"];
  const index = order.indexOf(id);
  if (error) {
    const failedIndex = failedStep ? order.indexOf(failedStep) : order.indexOf("request");
    if (index < failedIndex) return "done";
    if (index === failedIndex) return "error";
    return "pending";
  }
  if (loading) {
    if (id === "prepare") return "done";
    if (id === "request") return "current";
    return "pending";
  }
  return "done";
}

export function suggestStepProgress(
  loading: boolean,
  error: string,
  failedStep: SuggestStepId | null,
): number {
  const completed = SUGGEST_STEPS.filter(
    (step) => suggestStepState(step.id, loading, error, failedStep) === "done",
  ).length;
  const hasCurrent = SUGGEST_STEPS.some(
    (step) => suggestStepState(step.id, loading, error, failedStep) === "current",
  );
  return Math.round(((completed + (hasCurrent ? 0.5 : 0)) / SUGGEST_STEPS.length) * 100);
}
