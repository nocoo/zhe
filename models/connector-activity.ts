import { canonicalXPost } from "@/cli/src/connector/core";
import { canonicalGitHubRepo } from "@/cli/src/connector/github-core";
import { screenshotTarget } from "@/cli/src/connector/screenshot-core";
import { GITHUB_ERROR_LABELS } from "./github-bookmarks";
import { xMediaFailureMessage } from "./x-bookmarks";

export type EnrichmentSource = "x" | "github" | "screenshot";
export type EnrichmentState =
  | "pending"
  | "running"
  | "complete"
  | "partial"
  | "failed"
  | "unavailable";

export const ENRICHMENT_SOURCES = { x: "X 帖子", github: "GitHub 仓库", screenshot: "网站截图" };
export const ENRICHMENT_STATES = {
  pending: "等待补全",
  running: "正在补全",
  complete: "已补全",
  partial: "部分完成",
  failed: "补全失败",
  unavailable: "无法访问",
};

export interface EnrichmentTask {
  linkId: number;
  source: EnrichmentSource;
  title: string;
  url: string;
  state: EnrichmentState;
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number;
  updatedAt: number;
  errorCode: string | null;
  connectorName: string | null;
  textChars: number;
  mediaCount: number;
  mediaTotal: number;
  archivedBytes: number;
  previewUrl: string | null;
  recordedFailures: number;
  historyComplete: boolean;
}

export interface EnrichmentEvent {
  id: number;
  source: EnrichmentSource;
  kind: "snapshot" | "queued" | "started" | "finished";
  state: EnrichmentState;
  attempts: number;
  errorCode: string | null;
  connectorName: string | null;
  textChars: number;
  mediaCount: number;
  mediaTotal: number;
  archivedBytes: number;
  createdAt: number;
}

export function enrichmentSource(url: string): EnrichmentSource | null {
  if (canonicalXPost(url)) return "x";
  if (canonicalGitHubRepo(url)) return "github";
  return screenshotTarget(url) ? "screenshot" : null;
}

export function canRetryEnrichment(task: EnrichmentTask, now = Date.now()) {
  return (
    ["failed", "partial", "unavailable"].includes(task.state) ||
    (task.state === "running" && task.leaseUntil <= now)
  );
}

export function enrichmentError(code: string): string {
  const messages: Record<string, string> = {
    ...GITHUB_ERROR_LABELS,
    opencli_unavailable: "OpenCLI 连接或采集子进程启动失败",
    screenshot_unavailable: "网页无法截图，请检查浏览器中能否正常打开",
    screenshot_too_large: "截图文件超过大小上限",
    invalid_screenshot: "截图格式或尺寸校验失败",
    unsafe_screenshot_url: "网页跳转到了不支持截图的地址",
    github_unavailable: "GitHub 暂时无法访问",
    github_response_invalid: "GitHub 返回的仓库内容不完整",
    github_unsafe_redirect: "GitHub 跳转地址校验失败",
    connector_error: "补全执行失败",
    media_incomplete: "部分附件尚未归档",
  };
  return messages[code] ?? xMediaFailureMessage(code);
}

export function enrichmentContent(task: EnrichmentTask) {
  if (task.source === "screenshot") return task.previewUrl ? "1 张网站截图" : "尚未获得截图";
  const parts =
    task.source === "github"
      ? [`README ${task.textChars.toLocaleString("zh-CN")} 字符`]
      : [
          `正文 ${task.textChars.toLocaleString("zh-CN")} 字符`,
          `附件 ${task.mediaCount}/${task.mediaTotal}`,
        ];
  if (task.archivedBytes > 0)
    parts.push(
      `${(task.archivedBytes / 1024).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} KiB`,
    );
  return parts.join(" · ");
}
