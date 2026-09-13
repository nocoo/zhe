import { randomUUID } from "node:crypto";
import { canonicalXPost, type XCapture, type XMedia, type XPost } from "@/cli/src/connector/core";
import { executeD1Batch, executeD1Query } from "@/lib/db/d1-client";
import { ACTIVE_KEY_SQL, activeKeyParams, type ConnectorIdentity } from "./auth";
import { validateCapture } from "./validation";

export const LEASE_MS = 180_000;
const ELIGIBLE_SQL = `attempts < 5 AND (
  (state IN ('pending','partial','failed') AND next_attempt_at <= ?) OR
  (state = 'running' AND lease_until <= ?))`;
export const LEASE_SQL = `link_id = ? AND user_id = ? AND state = 'running'
  AND lease_key_id = ? AND lease_token = ? AND lease_until > ? AND ${ACTIVE_KEY_SQL}`;
export function leaseParams(
  auth: ConnectorIdentity,
  linkId: number,
  token: string,
  now: number,
): unknown[] {
  return [linkId, auth.userId, auth.keyId, token, now, ...activeKeyParams(auth, now)];
}

export interface XJob {
  linkId: number;
  userId: string;
  postId: string;
  sourceUrl: string;
  leaseToken: string;
  leaseUntil: number;
  attempts: number;
}
type JobRow = {
  link_id: number;
  user_id: string;
  source_url: string;
  post_id: string;
  state: XBookmark["state"];
  attempts: number;
  lease_token: string;
  lease_until: number;
  draft_json: string | null;
  result_json: string | null;
  removed_media: string;
  error_code: string | null;
  updated_at: number;
};

export async function claimXBookmark(
  auth: ConnectorIdentity,
  now = Date.now(),
): Promise<XJob | null> {
  const hosts = [
    "x.com",
    "www.x.com",
    "mobile.x.com",
    "twitter.com",
    "www.twitter.com",
    "mobile.twitter.com",
  ];
  await executeD1Query(
    `INSERT OR IGNORE INTO x_bookmarks(link_id,user_id,source_url,updated_at)
    SELECT id,user_id,original_url,? FROM links l WHERE user_id = ?
      AND (${hosts.map(() => "original_url LIKE ?").join(" OR ")})
      AND NOT EXISTS(SELECT 1 FROM x_bookmarks x WHERE x.link_id = l.id)
      AND ${ACTIVE_KEY_SQL}`,
    [
      now,
      auth.userId,
      ...hosts.map((h) => `https://${h}/%/status/%`),
      ...activeKeyParams(auth, now),
    ],
  );
  await executeD1Query(
    `UPDATE x_bookmarks SET state=CASE WHEN result_json IS NULL THEN 'failed' ELSE 'partial' END,
      error_code='interrupted', lease_until=0, updated_at=?
      WHERE user_id=? AND state='running' AND attempts >= 5 AND lease_until <= ? AND ${ACTIVE_KEY_SQL}`,
    [now, auth.userId, now, ...activeKeyParams(auth, now)],
  );
  // Bounded work per poll; malformed saved URLs are retired so they cannot starve valid work.
  for (let i = 0; i < 20; i++) {
    const [candidate] = await executeD1Query<JobRow>(
      `SELECT * FROM x_bookmarks WHERE user_id = ? AND ${ELIGIBLE_SQL} ORDER BY link_id LIMIT 1`,
      [auth.userId, now, now],
    );
    if (!candidate) return null;
    const post = canonicalXPost(candidate.source_url);
    const token = randomUUID();
    const rows = await executeD1Query<JobRow>(
      `UPDATE x_bookmarks SET post_id=?, state=?,
      attempts=attempts+1, lease_key_id=?, lease_token=?, lease_until=?, updated_at=?, draft_json=NULL
      WHERE link_id=? AND user_id=? AND source_url=? AND ${ELIGIBLE_SQL} AND ${ACTIVE_KEY_SQL} RETURNING *`,
      [
        post?.id ?? null,
        post ? "running" : "unavailable",
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
      ],
    );
    const row = rows[0];
    if (row && post)
      return {
        linkId: row.link_id,
        userId: row.user_id,
        postId: post.id,
        sourceUrl: post.url,
        leaseToken: token,
        leaseUntil: row.lease_until,
        attempts: row.attempts,
      };
    if (!post && row) continue;
  }
  return null;
}

export async function renewXBookmark(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  return (
    (
      await executeD1Query(
        `UPDATE x_bookmarks SET lease_until=?, updated_at=? WHERE ${LEASE_SQL} RETURNING link_id`,
        [now + LEASE_MS, now, ...leaseParams(auth, id, token, now)],
      )
    ).length > 0
  );
}

export async function stageXCapture(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  raw: unknown,
  now = Date.now(),
): Promise<boolean> {
  const [row] = await executeD1Query<JobRow>(
    `SELECT * FROM x_bookmarks WHERE ${LEASE_SQL}`,
    leaseParams(auth, id, token, now),
  );
  if (!row) return false;
  const capture = validateCapture(raw, row.post_id);
  const removed = JSON.parse(row.removed_media) as string[];
  capture.media = capture.tweet.media = capture.media.filter(
    (m) => !removed.includes(`${m.id}:${m.type === "PHOTO" ? "photo" : "video"}`),
  );
  now = Math.max(now, Date.now());
  return (
    (
      await executeD1Query(
        `UPDATE x_bookmarks SET draft_json=?, updated_at=? WHERE ${LEASE_SQL} RETURNING link_id`,
        [JSON.stringify(capture), now, ...leaseParams(auth, id, token, now)],
      )
    ).length > 0
  );
}

export async function completeXBookmark(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  const [row] = await executeD1Query<JobRow>(
    `SELECT * FROM x_bookmarks WHERE ${LEASE_SQL} AND draft_json IS NOT NULL`,
    leaseParams(auth, id, token, now),
  );
  if (!row?.draft_json) return false;
  const capture = JSON.parse(row.draft_json) as XCapture;
  const media = await executeD1Query<{ media_id: string; kind: string }>(
    `SELECT media_id,kind FROM x_media WHERE link_id=? AND user_id=? AND state IN ('verified','published')`,
    [id, auth.userId],
  );
  const complete = capture.media.every((m) =>
    media.some((a) => a.media_id === m.id && a.kind === (m.type === "PHOTO" ? "photo" : "video")),
  );
  const state = complete ? "complete" : "partial";
  now = Math.max(now, Date.now());
  const results = await executeD1Batch<{ link_id: number }>([
    {
      sql: `INSERT INTO uploads(user_id,key,file_name,file_type,file_size,public_url,created_at)
        SELECT user_id,r2_key,media_id || CASE mime WHEN 'video/mp4' THEN '.mp4' WHEN 'image/png' THEN '.png' WHEN 'image/webp' THEN '.webp' ELSE '.jpg' END,mime,size,? || '/' || r2_key,?
        FROM x_media WHERE link_id=? AND user_id=? AND state='verified'
          AND EXISTS(SELECT 1 FROM x_bookmarks WHERE ${LEASE_SQL})
        ON CONFLICT(key) DO NOTHING`,
      params: [
        (process.env.R2_PUBLIC_DOMAIN ?? "").replace(/\/$/, ""),
        now,
        id,
        auth.userId,
        ...leaseParams(auth, id, token, now),
      ],
    },
    {
      sql: `UPDATE x_media SET state='published', upload_id=(SELECT id FROM uploads WHERE key=x_media.r2_key AND user_id=x_media.user_id)
        WHERE link_id=? AND user_id=? AND state='verified' AND EXISTS(SELECT 1 FROM x_bookmarks WHERE ${LEASE_SQL})`,
      params: [id, auth.userId, ...leaseParams(auth, id, token, now)],
    },
    {
      sql: `UPDATE links SET meta_title=?, meta_description=? WHERE id=? AND user_id=?
        AND EXISTS(SELECT 1 FROM x_bookmarks WHERE ${LEASE_SQL})`,
      params: [
        `${capture.tweet.author.name} (@${capture.tweet.author.username})`,
        capture.tweet.text,
        id,
        auth.userId,
        ...leaseParams(auth, id, token, now),
      ],
    },
    {
      sql: `UPDATE x_bookmarks SET result_json=draft_json, draft_json=NULL, state=?, error_code=?, lease_until=0, next_attempt_at=?, updated_at=?
        WHERE ${LEASE_SQL} RETURNING link_id`,
      params: [
        state,
        complete ? null : "media_incomplete",
        now + 300_000,
        now,
        ...leaseParams(auth, id, token, now),
      ],
    },
  ]);
  return (results[3]?.length ?? 0) > 0;
}

export const FAILURE_CODES = [
  "needs_login",
  "post_unavailable",
  "opencli_unavailable",
  "unsupported_opencli_version",
  "adapter_contract_changed",
  "download_failed",
  "decode_failed",
  "upload_failed",
  "interrupted",
  "connector_error",
] as const;
export async function failXBookmark(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  code: string,
  now = Date.now(),
): Promise<boolean> {
  const safeCode = (FAILURE_CODES as readonly string[]).includes(code) ? code : "connector_error";
  return (
    (
      await executeD1Query(
        `UPDATE x_bookmarks SET state=CASE WHEN result_json IS NULL THEN 'failed' ELSE 'partial' END,
    error_code=?, next_attempt_at=? + MIN(3600000, 60000 * (1 << attempts)), lease_until=0, updated_at=?
    WHERE ${LEASE_SQL} RETURNING link_id`,
        [safeCode, now, now, ...leaseParams(auth, id, token, now)],
      )
    ).length > 0
  );
}

export interface XBookmark {
  linkId: number;
  state: "pending" | "running" | "complete" | "partial" | "failed" | "unavailable";
  tweet: XPost | null;
  errorCode: string | null;
  updatedAt: number;
}
export async function getXBookmarks(userId: string, ids: number[]): Promise<XBookmark[]> {
  if (!ids.length) return [];
  const selected = [...new Set(ids)].slice(0, 80);
  const rows = await executeD1Query<JobRow>(
    `SELECT * FROM x_bookmarks WHERE user_id=? AND link_id IN (${selected.map(() => "?").join(",")})`,
    [userId, ...selected],
  );
  const attachments = await executeD1Query<{
    link_id: number;
    media_id: string;
    kind: string;
    public_url: string;
  }>(
    `SELECT m.link_id,m.media_id,m.kind,u.public_url FROM x_media m JOIN uploads u ON u.id=m.upload_id AND u.user_id=m.user_id
    WHERE m.user_id=? AND m.state='published' AND m.link_id IN (${selected.map(() => "?").join(",")})`,
    [userId, ...selected],
  );
  return rows.map((row) => {
    const tweet = row.result_json ? (JSON.parse(row.result_json) as XCapture).tweet : null;
    if (tweet) {
      tweet.media = tweet.media.flatMap((m): XMedia[] => {
        const match = attachments.find(
          (a) =>
            a.link_id === row.link_id &&
            a.media_id === m.id &&
            a.kind === (m.type === "PHOTO" ? "photo" : "video"),
        );
        if (!match) return [];
        const poster = attachments.find(
          (a) => a.link_id === row.link_id && a.media_id === m.id && a.kind === "poster",
        );
        return [{ ...m, url: match.public_url, thumbnail_url: poster?.public_url }];
      });
    }
    return {
      linkId: row.link_id,
      state: row.state,
      tweet,
      errorCode: row.error_code,
      updatedAt: row.updated_at,
    };
  });
}
