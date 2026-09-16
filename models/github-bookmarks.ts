import type { GitHubRepositorySummary } from "@/cli/src/connector/github-core";

/** Resolve repository-relative README links without enabling unsafe URL schemes. */
export function githubReadmeUrl(
  raw: string,
  image: boolean,
  repository: GitHubRepositorySummary,
): string {
  if (!raw || (image && raw.startsWith("#"))) return "";
  try {
    const path = (repository.readmePath ?? "README.md")
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const root = image
      ? `https://raw.githubusercontent.com/${repository.fullName}/${encodeURIComponent(repository.defaultBranch)}/`
      : `https://github.com/${repository.fullName}/blob/${encodeURIComponent(repository.defaultBranch)}/`;
    const url = new URL(
      raw.startsWith("/") && !raw.startsWith("//") ? `${root}${raw.slice(1)}` : raw,
      `${root}${path}`,
    );
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

export const GITHUB_STATE_LABELS = {
  pending: "等待补全",
  running: "正在补全",
  complete: "已补全",
  failed: "补全失败",
  unavailable: "仓库不可访问",
};

export const GITHUB_ERROR_LABELS: Record<string, string> = {
  github_needs_login: "本机 GitHub 登录已失效",
  github_rate_limited: "GitHub 暂时限制访问，稍后重试",
  github_repository_unavailable: "仓库不存在或本机账号没有访问权限",
  github_content_too_large: "README 超过归档上限，请在 GitHub 阅读全文",
};
