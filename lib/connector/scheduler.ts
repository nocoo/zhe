import type { ConnectorJob } from "@/cli/src/connector/types";
import { executeD1Query } from "@/lib/db/d1-client";
import type { ConnectorIdentity } from "./auth";
import { claimGitHubBookmark } from "./github-jobs";
import { claimXBookmark } from "./jobs";
import { claimScreenshot } from "./screenshot-jobs";

const SOURCES = ["github", "x", "screenshot"] as const;
type Source = (typeof SOURCES)[number];
const TABLES = { github: "github_bookmarks", x: "x_bookmarks", screenshot: "screenshot_jobs" };

export async function claimConnectorJob(
  auth: ConnectorIdentity,
  supported: string[],
): Promise<ConnectorJob | null> {
  const now = Date.now();
  const supportedSources = SOURCES.filter((source) => supported.includes(source));
  if (!supportedSources.length) return null;
  // Cache absolute deadlines, not a time-dependent eligible/not-eligible result.
  // New links and job transitions advance the Worker's per-owner KV generation.
  const readiness = await executeD1Query<{ source: Source | "busy"; ready_at: number | null }>(
    SOURCES.map(
      (source) => `SELECT '${source}' AS source,MIN(ready_at) AS ready_at FROM (
        SELECT 0 AS ready_at FROM connector_discovery WHERE user_id=? AND source='${source}'
        UNION ALL SELECT CASE WHEN state='running' THEN lease_until ELSE next_attempt_at END
          FROM ${TABLES[source]} WHERE user_id=? AND state IN ('pending','partial','failed','running')
          AND (attempts<5 OR state='running')
      )`,
    ).join(" UNION ALL ") +
      ` UNION ALL SELECT 'busy',MAX(lease_until) FROM (
        ${SOURCES.map((source) => `SELECT lease_until FROM ${TABLES[source]} WHERE user_id=? AND state='running'`).join(" UNION ALL ")}
      )`,
    SOURCES.flatMap(() => [auth.userId, auth.userId]).concat(SOURCES.map(() => auth.userId)),
    { connectorUserId: auth.userId, connectorCache: { key: "readiness" } },
  );
  if (readiness.some((row) => row.source === "busy" && (row.ready_at ?? 0) > now)) return null;
  const ready = new Set(
    readiness
      .filter((row) => row.ready_at !== null && row.ready_at <= now)
      .map((row) => row.source),
  );
  const sources = supportedSources.filter((source) => ready.has(source));
  if (!sources.length) return null;
  // Least recently served source goes first. A large backlog cannot starve the others.
  const history = await executeD1Query<{ source: Source; last_run: number }>(
    SOURCES.map(
      (source) => `SELECT '${source}' AS source,MAX(updated_at) AS last_run
        FROM ${TABLES[source]} WHERE user_id=? AND attempts>0`,
    ).join(" UNION ALL "),
    SOURCES.map(() => auth.userId),
    { connectorUserId: auth.userId, connectorCache: { key: "history" } },
  );
  const lastRun = new Map(history.map(({ source, last_run }) => [source, last_run]));
  sources.sort((a, b) => (lastRun.get(a) ?? 0) - (lastRun.get(b) ?? 0));
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
    { connectorUserId: userId, connectorCache: { key: "states" } },
  );
}
