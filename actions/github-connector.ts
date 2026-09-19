"use server";

import { canonicalGitHubRepo, type GitHubRepository } from "@/cli/src/connector/github-core";
import { requireAuth } from "@/lib/auth-context";
import {
  type GitHubBookmark,
  getGitHubBookmarks,
  getGitHubRepository,
} from "@/lib/connector/github-jobs";
import { executeD1Query } from "@/lib/db/d1-client";

const validId = (id: number) => Number.isSafeInteger(id) && id > 0;

export async function loadGitHubBookmarks(
  ids: number[],
): Promise<{ success: boolean; data?: GitHubBookmark[] }> {
  const userId = await requireAuth();
  if (!userId || !Array.isArray(ids) || ids.length > 80 || !ids.every(validId))
    return { success: false };
  try {
    return { success: true, data: await getGitHubBookmarks(userId, ids) };
  } catch {
    return { success: false };
  }
}

export async function loadGitHubReadme(
  id: number,
): Promise<{ success: boolean; data?: GitHubRepository | null }> {
  const userId = await requireAuth();
  if (!userId || !validId(id)) return { success: false };
  try {
    return { success: true, data: await getGitHubRepository(userId, id) };
  } catch {
    return { success: false };
  }
}

export async function retryGitHubBookmarkAction(id: number): Promise<{ success: boolean }> {
  const userId = await requireAuth();
  if (!userId || !validId(id)) return { success: false };
  try {
    const [link] = await executeD1Query<{ original_url: string }>(
      "SELECT original_url FROM links WHERE id=? AND user_id=?",
      [id, userId],
    );
    if (!link || !canonicalGitHubRepo(link.original_url)) return { success: false };
    const now = Date.now();
    const rows = await executeD1Query(
      `INSERT INTO github_bookmarks(link_id,user_id,source_url,updated_at)
        SELECT id,user_id,original_url,? FROM links WHERE id=? AND user_id=? AND original_url=?
        ON CONFLICT(link_id) DO UPDATE SET state='pending',attempts=0,next_attempt_at=0,lease_until=0,error_code=NULL,updated_at=excluded.updated_at
        WHERE github_bookmarks.user_id=excluded.user_id AND github_bookmarks.source_url=excluded.source_url
          AND (github_bookmarks.state<>'running' OR github_bookmarks.lease_until<=?) RETURNING link_id`,
      [now, id, userId, link.original_url, now],
      { connectorUserId: userId },
    );
    return { success: rows.length > 0 };
  } catch {
    return { success: false };
  }
}
