import type { ConnectorJob } from "@/cli/src/connector/types";
import { executeD1Query } from "@/lib/db/d1-client";
import type { ConnectorIdentity } from "./auth";
import { claimGitHubBookmark } from "./github-jobs";
import { claimXBookmark, connectorIsIdle } from "./jobs";
import { claimScreenshot } from "./screenshot-jobs";

const SOURCES = ["github", "x", "screenshot"] as const;
type Source = (typeof SOURCES)[number];

export async function claimConnectorJob(
  auth: ConnectorIdentity,
  supported: string[],
): Promise<ConnectorJob | null> {
  const now = Date.now();
  if (!(await connectorIsIdle(auth, now))) return null;
  // Least recently served source goes first. A large backlog cannot starve the others.
  const history = await executeD1Query<{ source: Source; last_run: number }>(
    `SELECT source,MAX(updated_at) AS last_run FROM (
      SELECT 'x' AS source,updated_at FROM x_bookmarks WHERE user_id=? AND attempts>0
      UNION ALL SELECT 'github',updated_at FROM github_bookmarks WHERE user_id=? AND attempts>0
      UNION ALL SELECT 'screenshot',updated_at FROM screenshot_jobs WHERE user_id=? AND attempts>0
    ) GROUP BY source`,
    [auth.userId, auth.userId, auth.userId],
  );
  const lastRun = new Map(history.map(({ source, last_run }) => [source, last_run]));
  const sources = SOURCES.filter((source) => supported.includes(source)).sort(
    (a, b) => (lastRun.get(a) ?? 0) - (lastRun.get(b) ?? 0),
  );
  for (const source of sources) {
    const job = await {
      x: claimXBookmark,
      github: claimGitHubBookmark,
      screenshot: claimScreenshot,
    }[source](auth);
    if (job) return job;
  }
  return null;
}

export async function connectorStates(userId: string): Promise<{ state: string; count: number }[]> {
  return executeD1Query(
    `SELECT state,COUNT(*) AS count FROM (
      SELECT state FROM x_bookmarks WHERE user_id=?
      UNION ALL SELECT state FROM github_bookmarks WHERE user_id=?
      UNION ALL SELECT state FROM screenshot_jobs WHERE user_id=?
    ) GROUP BY state`,
    [userId, userId, userId],
  );
}
