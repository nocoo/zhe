import { randomUUID } from "node:crypto";
import { ConnectorError } from "@/cli/src/connector/core";
import {
  canonicalGitHubRepo,
  type GitHubRepository,
  type GitHubRepositorySummary,
  MAX_GITHUB_CAPTURE_BYTES,
  validateGitHubRepository,
} from "@/cli/src/connector/github-core";
import type { GitHubJob } from "@/cli/src/connector/types";
import { executeD1Batch, executeD1Query } from "@/lib/db/d1-client";
import type { GitHubAnalysis } from "@/models/ai-github-analysis";
import { ACTIVE_KEY_SQL, activeKeyParams, type ConnectorIdentity } from "./auth";
import { discoverConnectorLinks } from "./discovery";
import {
  CONNECTOR_IDLE_SQL,
  connectorIdleParams,
  connectorIsIdle,
  ELIGIBLE_SQL,
  LEASE_MS,
  LEASE_SQL,
  leaseParams,
} from "./jobs";

type JobRow = {
  link_id: number;
  source_url: string;
  full_name: string;
  state: GitHubBookmark["state"];
  attempts: number;
  lease_until: number;
  result_json: string | null;
  error_code: string | null;
  updated_at: number;
  captured_at: number | null;
  has_readme: number;
  analysis_json: string | null;
  note: string | null;
};

export interface GitHubBookmark {
  linkId: number;
  sourceUrl: string;
  state: "pending" | "running" | "complete" | "failed" | "unavailable";
  repository: GitHubRepositorySummary | null;
  hasReadme: boolean;
  errorCode: string | null;
  capturedAt: number | null;
  updatedAt: number;
  note: string | null;
  analysis?: GitHubAnalysis | null;
}

export async function claimGitHubBookmark(
  auth: ConnectorIdentity,
  now = Date.now(),
): Promise<GitHubJob | null> {
  await discoverConnectorLinks(
    auth,
    "github",
    `INSERT OR IGNORE INTO github_bookmarks(link_id,user_id,source_url,updated_at)
      SELECT id,user_id,original_url,? FROM links l WHERE id IN (SELECT link_id FROM connector_discovery WHERE user_id=? AND source='github')
      AND (lower(original_url) LIKE 'https://github.com/%/%' OR lower(original_url) LIKE 'http://github.com/%/%'
        OR lower(original_url) LIKE 'https://www.github.com/%/%' OR lower(original_url) LIKE 'http://www.github.com/%/%')
      AND NOT EXISTS(SELECT 1 FROM github_bookmarks g WHERE g.link_id=l.id) AND ${ACTIVE_KEY_SQL}`,
    [now, auth.userId, ...activeKeyParams(auth, now)],
    now,
  );
  await executeD1Query(
    `UPDATE github_bookmarks SET state='failed',error_code='interrupted',lease_until=0,updated_at=?
      WHERE user_id=? AND state='running' AND attempts>=5 AND lease_until<=? AND ${ACTIVE_KEY_SQL}`,
    [now, auth.userId, now, ...activeKeyParams(auth, now)],
    { connectorUserId: auth.userId },
  );
  for (let i = 0; i < 20; i++) {
    const [candidate] = await executeD1Query<JobRow>(
      `SELECT link_id,source_url FROM github_bookmarks WHERE user_id=? AND ${ELIGIBLE_SQL} ORDER BY link_id LIMIT 1`,
      [auth.userId, now, now],
    );
    if (!candidate) return null;
    const repository = canonicalGitHubRepo(candidate.source_url);
    const token = randomUUID();
    const [row] = await executeD1Query<JobRow>(
      `UPDATE github_bookmarks SET full_name=?,state=?,attempts=attempts+1,lease_key_id=?,lease_token=?,lease_until=?,updated_at=?
        WHERE link_id=? AND user_id=? AND source_url=? AND ${ELIGIBLE_SQL} AND ${ACTIVE_KEY_SQL}
          AND ${CONNECTOR_IDLE_SQL} RETURNING link_id,attempts,lease_until`,
      [
        repository?.fullName ?? null,
        repository ? "running" : "unavailable",
        auth.keyId,
        token,
        now + LEASE_MS,
        now,
        candidate.link_id,
        auth.userId,
        candidate.source_url,
        now,
        now,
        ...activeKeyParams(auth, now),
        ...connectorIdleParams(auth, now),
      ],
      { connectorUserId: auth.userId },
    );
    if (!row && !(await connectorIsIdle(auth, now))) return null;
    if (row && repository)
      return {
        source: "github",
        linkId: row.link_id,
        userId: auth.userId,
        fullName: repository.fullName,
        sourceUrl: repository.url,
        leaseToken: token,
        leaseUntil: row.lease_until,
        attempts: row.attempts,
      };
  }
  return null;
}

export async function renewGitHubBookmark(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  return (
    (
      await executeD1Query(
        `UPDATE github_bookmarks SET lease_until=?,updated_at=? WHERE ${LEASE_SQL} RETURNING link_id`,
        [now + LEASE_MS, now, ...leaseParams(auth, id, token, now)],
        { connectorUserId: auth.userId },
      )
    ).length > 0
  );
}

export async function completeGitHubBookmark(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  raw: unknown,
  now = Date.now(),
): Promise<boolean> {
  const [row] = await executeD1Query<JobRow>(
    `SELECT full_name FROM github_bookmarks WHERE ${LEASE_SQL}`,
    leaseParams(auth, id, token, now),
  );
  if (!row) return false;
  let repository: GitHubRepository;
  try {
    repository = validateGitHubRepository(raw, row.full_name);
  } catch {
    throw new ConnectorError("invalid_github_capture", 400);
  }
  const result = JSON.stringify(repository);
  if (Buffer.byteLength(result) > MAX_GITHUB_CAPTURE_BYTES)
    throw new ConnectorError("github_content_too_large", 413);
  now = Math.max(now, Date.now());
  const results = await executeD1Batch(
    [
      {
        sql: `UPDATE links SET meta_title=?,meta_description=? WHERE id=? AND user_id=?
        AND EXISTS(SELECT 1 FROM github_bookmarks WHERE ${LEASE_SQL})`,
        params: [
          repository.fullName,
          repository.description,
          id,
          auth.userId,
          ...leaseParams(auth, id, token, now),
        ],
      },
      {
        sql: `UPDATE github_bookmarks SET result_json=CASE
          WHEN json_type(result_json,'$.analysis')='object' AND json_extract(result_json,'$.readme')=?
          THEN json_set(?,'$.analysis',json_extract(result_json,'$.analysis')) ELSE ? END,
        state='complete',error_code=NULL,lease_until=0,captured_at=?,updated_at=?
        WHERE ${LEASE_SQL} RETURNING link_id`,
        params: [repository.readme, result, result, now, now, ...leaseParams(auth, id, token, now)],
      },
    ],
    { connectorUserId: auth.userId },
  );
  return (results[1]?.length ?? 0) > 0;
}

const FAILURE_CODES = [
  "github_needs_login",
  "github_rate_limited",
  "github_repository_unavailable",
  "github_unavailable",
  "github_response_invalid",
  "github_content_too_large",
  "github_unsafe_redirect",
  "interrupted",
];
export async function failGitHubBookmark(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  code: string,
  now = Date.now(),
): Promise<boolean> {
  return (
    (
      await executeD1Query(
        `UPDATE github_bookmarks SET state='failed',error_code=?,next_attempt_at=? + MIN(3600000,60000 * (1 << attempts)),lease_until=0,updated_at=?
      WHERE ${LEASE_SQL} RETURNING link_id`,
        [
          FAILURE_CODES.includes(code) ? code : "connector_error",
          now,
          now,
          ...leaseParams(auth, id, token, now),
        ],
        { connectorUserId: auth.userId },
      )
    ).length > 0
  );
}

export async function getGitHubBookmarks(userId: string, ids: number[]): Promise<GitHubBookmark[]> {
  const selected = [...new Set(ids)].slice(0, 80);
  if (!selected.length) return [];
  const rows = await executeD1Query<JobRow>(
    `SELECT link_id,source_url,state,error_code,captured_at,updated_at,json_remove(result_json,'$.readme','$.analysis') AS result_json,
      json_extract(result_json,'$.analysis') AS analysis_json,
      (SELECT note FROM links WHERE id=github_bookmarks.link_id AND user_id=github_bookmarks.user_id
        AND original_url=github_bookmarks.source_url) AS note,
      json_type(result_json,'$.readme')='text' AS has_readme FROM github_bookmarks
      WHERE user_id=? AND link_id IN (${selected.map(() => "?").join(",")})`,
    [userId, ...selected],
  );
  return rows.map((row) => ({
    linkId: row.link_id,
    sourceUrl: row.source_url,
    state: row.state,
    repository: row.result_json ? (JSON.parse(row.result_json) as GitHubRepositorySummary) : null,
    hasReadme: Boolean(row.has_readme),
    errorCode: row.error_code,
    capturedAt: row.captured_at,
    updatedAt: row.updated_at,
    note: row.note,
    analysis: row.analysis_json ? (JSON.parse(row.analysis_json) as GitHubAnalysis) : null,
  }));
}

export async function getGitHubRepository(
  userId: string,
  id: number,
): Promise<GitHubRepository | null> {
  const [row] = await executeD1Query<{ result_json: string | null }>(
    `SELECT g.result_json FROM github_bookmarks g JOIN links l ON l.id=g.link_id AND l.user_id=g.user_id
      WHERE g.user_id=? AND g.link_id=? AND g.source_url=l.original_url`,
    [userId, id],
  );
  return row?.result_json ? (JSON.parse(row.result_json) as GitHubRepository) : null;
}
