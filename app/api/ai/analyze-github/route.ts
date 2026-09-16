import { NextResponse } from "next/server";
import { canonicalGitHubRepo } from "@/cli/src/connector/github-core";
import { aiErrorResponse } from "@/lib/ai/errors";
import { runAiTask } from "@/lib/ai/run-task";
import { buildGitHubAnalysisPrompt, GITHUB_ANALYSIS_SYSTEM } from "@/lib/ai/tasks/analyze-github";
import { getAuthContext } from "@/lib/auth-context";
import { getGitHubRepository, saveGitHubAnalysis } from "@/lib/connector/github-jobs";
import { type GitHubAnalysis, parseGitHubAnalysis } from "@/models/ai-github-analysis";

export async function POST(request: Request): Promise<Response> {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return aiErrorResponse("请求体不是有效 JSON", "validation", 400);
  }
  const id = body && typeof body === "object" && "linkId" in body ? body.linkId : null;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
    return aiErrorResponse("链接 ID 必须是正整数", "validation", 400);

  try {
    const link = await ctx.db.getLinkById(id);
    if (!link) return aiErrorResponse("链接不存在", "not_found", 404);
    const source = canonicalGitHubRepo(link.originalUrl);
    if (!source) return aiErrorResponse("这不是 GitHub 仓库链接", "validation", 400);
    const repository = await getGitHubRepository(ctx.userId, id);
    if (
      !repository?.readme?.trim() ||
      repository.sourceFullName.toLowerCase() !== source.fullName.toLowerCase()
    )
      return aiErrorResponse("请先采集该仓库的 README 全文", "validation", 409);
    const settings = await ctx.db.getAiSettings();
    if (!settings.provider || !settings.apiKey || !settings.model)
      return aiErrorResponse("请先在 AI 设置中配置供应商、模型和密钥", "no_ai_config", 400);

    const outcome = await runAiTask(settings, {
      system: GITHUB_ANALYSIS_SYSTEM,
      prompt: buildGitHubAnalysisPrompt(repository),
      parse: parseGitHubAnalysis,
      maxOutputTokens: 3000,
      timeoutMs: 60_000,
    });
    if (!outcome.ok) {
      const status =
        outcome.reason === "timeout" ? 504 : outcome.reason === "no_ai_config" ? 400 : 502;
      return aiErrorResponse(
        outcome.reason === "ai_error"
          ? "AI 分析失败，请检查模型配置；较长的 README 需要支持长上下文的模型"
          : outcome.message,
        outcome.reason,
        status,
      );
    }
    const analysis: GitHubAnalysis = {
      ...outcome.result,
      model: outcome.model,
      provider: outcome.provider,
      generatedAt: Date.now(),
    };
    if (!(await saveGitHubAnalysis(ctx.userId, id, link.originalUrl, repository.readme, analysis)))
      return aiErrorResponse("仓库或 README 已更新，请重新分析", "validation", 409);
    return NextResponse.json({ analysis });
  } catch {
    return aiErrorResponse("仓库分析暂时无法保存，请稍后重试", "ai_error", 500);
  }
}
