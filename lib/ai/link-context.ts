import { canonicalGitHubRepo } from "@/cli/src/connector/github-core";
import { executeD1Query } from "@/lib/db/d1-client";
import { rowToLink } from "@/lib/db/mappers";
import type { ScopedDB } from "@/lib/db/scoped";
import { suggestedFoldersForSource } from "@/models/special-sources";
import { buildSuggestLinkOrgPrompt } from "./tasks/suggest-link-org";

/** A single owned snapshot: source joins cannot supply data from an old URL. */
export async function loadLinkOrgContext(db: ScopedDB, userId: string, linkId: number) {
  const [rows, folders, tags, assigned] = await Promise.all([
    executeD1Query<Record<string, unknown>>(
      `SELECT l.*,s.revision,x.result_json AS x_json,g.result_json AS github_json
       FROM links l JOIN search_documents s ON s.kind='link' AND s.resource_id=l.id AND s.user_id=l.user_id
       LEFT JOIN x_bookmarks x ON x.link_id=l.id AND x.user_id=l.user_id AND x.source_url=l.original_url
       LEFT JOIN github_bookmarks g ON g.link_id=l.id AND g.user_id=l.user_id AND g.source_url=l.original_url
       WHERE l.id=? AND l.user_id=?`,
      [linkId, userId],
    ),
    db.getFolders(),
    db.getTags(),
    db.getTagsForLink(linkId),
  ]);
  const row = rows[0];
  if (!row) return null;
  const link = rowToLink(row);
  const sources: Record<string, unknown> = {};
  const supplied = ["URL"];
  const notices: string[] = [];
  if (link.metaTitle) supplied.push("原始标题");
  if (link.metaDescription) supplied.push("原始简介");
  if (link.title || link.note) supplied.push("已有整理");
  if (link.screenshotUrl) sources.screenshotUrl = link.screenshotUrl;
  if (link.metaFavicon) sources.faviconUrl = link.metaFavicon;
  if (row.x_json) {
    sources.x = JSON.parse(String(row.x_json));
    supplied.push("X 帖子与媒体资料");
  }
  let historicalAnalysis: unknown = null;
  if (row.github_json) {
    const repository = JSON.parse(String(row.github_json)) as Record<string, unknown>;
    historicalAnalysis = repository.analysis ?? null;
    sources.github = repository;
    supplied.push("GitHub 仓库资料");
    if (typeof repository.readme === "string" && repository.readme.trim())
      supplied.push("README 全文");
  }
  if (canonicalGitHubRepo(link.originalUrl) && !supplied.includes("README 全文"))
    notices.push("README 未收录，本次使用已有资料整理");
  if (!link.metaTitle && !link.metaDescription && !row.x_json && !row.github_json)
    notices.push("来源资料较少，请核对生成内容");
  const catalogs = {
    folders: suggestedFoldersForSource(link.originalUrl, folders).map(({ id, name }) => ({
      id,
      name,
    })),
    tags: tags.map(({ id, name, color }) => ({ id, name, color })),
  };
  const prompt = buildSuggestLinkOrgPrompt({
    url: link.originalUrl,
    title: link.metaTitle ?? "",
    description: link.metaDescription ?? "",
    curatedTitle: link.title ?? "",
    note: link.note ?? "",
    currentFolder: folders.find((f) => f.id === link.folderId)?.name ?? "Inbox",
    currentTags: assigned.map((t) => t.name).join(", "),
    catalogs,
    sources,
  });
  return {
    link,
    revision: Number(row.revision),
    catalogs,
    assigned,
    prompt,
    supplied,
    notices,
    historicalAnalysis,
  };
}
