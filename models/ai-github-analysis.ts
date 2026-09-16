import { SuggestParseError } from "@/models/ai-suggest-link-org";

export interface GitHubAnalysisFields {
  summary: string;
  features: string[];
  useCases: string[];
  techStack: string[];
  tags: string[];
}

export interface GitHubAnalysis extends GitHubAnalysisFields {
  model: string;
  provider: string;
  generatedAt: number;
}

export function parseGitHubAnalysis(text: string): GitHubAnalysisFields {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const value: unknown = JSON.parse(cleaned);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SuggestParseError("AI 返回的仓库分析格式无效");
  const fields = value as Record<string, unknown>;
  if (typeof fields.summary !== "string" || !fields.summary.trim())
    throw new SuggestParseError("AI 未返回仓库简介");
  const list = (key: string, limit: number, length: number): string[] => {
    const items = fields[key];
    if (!Array.isArray(items) || items.some((item) => typeof item !== "string"))
      throw new SuggestParseError(`AI 返回的 ${key} 字段格式无效`);
    return [...new Set(items.map((item) => item.trim().slice(0, length)).filter(Boolean))].slice(
      0,
      limit,
    );
  };
  return {
    summary: fields.summary.trim().slice(0, 180),
    features: list("features", 5, 100),
    useCases: list("useCases", 4, 100),
    techStack: list("techStack", 8, 40),
    tags: list("tags", 5, 30),
  };
}
