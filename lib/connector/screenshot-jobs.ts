import { createHash, randomUUID } from "node:crypto";
import { ConnectorError } from "@/cli/src/connector/core";
import {
  MAX_SCREENSHOT_BYTES,
  screenshotTarget,
  validateScreenshot,
} from "@/cli/src/connector/screenshot-core";
import type { ScreenshotJob } from "@/cli/src/connector/types";
import { executeD1Batch, executeD1Query } from "@/lib/db/d1-client";
import { uploadBufferToR2 } from "@/lib/r2/client";
import { enqueueR2Deletion } from "@/lib/r2/gc";
import { buildPublicUrl, generateObjectKey, hashUserId } from "@/models/upload";
import { ACTIVE_KEY_SQL, activeKeyParams, type ConnectorIdentity } from "./auth";
import {
  CONNECTOR_IDLE_SQL,
  connectorIdleParams,
  ELIGIBLE_SQL,
  LEASE_MS,
  LEASE_SQL,
  leaseParams,
} from "./jobs";

const MISSING_PREVIEW_SQL = "(screenshot_url IS NULL OR trim(screenshot_url)='')";
const CURRENT_LINK_SQL = `EXISTS(SELECT 1 FROM links WHERE id=screenshot_jobs.link_id
  AND user_id=screenshot_jobs.user_id AND original_url=screenshot_jobs.source_url AND ${MISSING_PREVIEW_SQL})`;
const LIVE_LEASE_SQL = `${LEASE_SQL} AND ${CURRENT_LINK_SQL}`;

type ScreenshotRow = {
  link_id: number;
  source_url: string;
  attempts: number;
  lease_until: number;
  r2_key: string;
  public_url: string;
  sha256: string | null;
};

export async function claimScreenshot(
  auth: ConnectorIdentity,
  now = Date.now(),
): Promise<ScreenshotJob | null> {
  // Discover the existing backlog and every save entry point. The URL parser below
  // is authoritative; this host filter keeps special sites out of the preview queue.
  await executeD1Query(
    `WITH candidates AS (
      SELECT id,user_id,original_url,lower(substr(original_url,instr(original_url,'://')+3)) AS authority
      FROM links WHERE user_id=? AND ${MISSING_PREVIEW_SQL}
        AND (original_url LIKE 'https://%' OR original_url LIKE 'http://%')
    ), addresses AS (
      SELECT *,rtrim(substr(authority,1,instr(replace(replace(authority,'?','/'),'#','/') || '/','/')-1),'.') AS host
      FROM candidates
    ), targets AS (
      SELECT *,rtrim(substr(host,1,instr(host || ':',':')-1),'.') AS hostname FROM addresses
    ) INSERT OR IGNORE INTO screenshot_jobs(link_id,user_id,source_url,updated_at)
      SELECT id,user_id,original_url,? FROM targets
      WHERE hostname NOT IN ('x.com','twitter.com','github.com')
        AND hostname NOT LIKE '%.x.com' AND hostname NOT LIKE '%.twitter.com' AND hostname NOT LIKE '%.github.com'
        AND NOT EXISTS(SELECT 1 FROM screenshot_jobs WHERE link_id=targets.id) AND ${ACTIVE_KEY_SQL}`,
    [auth.userId, now, ...activeKeyParams(auth, now)],
  );
  await executeD1Query(
    `UPDATE screenshot_jobs SET state='failed',error_code='interrupted',lease_until=0,r2_key=NULL,public_url=NULL,sha256=NULL,updated_at=?
      WHERE user_id=? AND state='running' AND attempts>=5 AND lease_until<=? AND ${ACTIVE_KEY_SQL}`,
    [now, auth.userId, now, ...activeKeyParams(auth, now)],
  );
  for (let i = 0; i < 20; i++) {
    const [candidate] = await executeD1Query<ScreenshotRow>(
      `SELECT link_id,source_url FROM screenshot_jobs WHERE user_id=? AND ${ELIGIBLE_SQL}
        AND ${CURRENT_LINK_SQL} ORDER BY link_id LIMIT 1`,
      [auth.userId, now, now],
    );
    if (!candidate) return null;
    const target = screenshotTarget(candidate.source_url);
    const salt = process.env.R2_USER_HASH_SALT;
    const domain = process.env.R2_PUBLIC_DOMAIN;
    if (target && (!salt || !domain)) throw new ConnectorError("storage_unavailable", 503);
    const key =
      target && salt
        ? generateObjectKey("screenshot.webp", await hashUserId(auth.userId, salt))
        : null;
    const token = randomUUID();
    const [row] = await executeD1Query<ScreenshotRow>(
      `UPDATE screenshot_jobs SET state=?,attempts=attempts+1,lease_key_id=?,lease_token=?,lease_until=?,
        r2_key=?,public_url=?,sha256=NULL,error_code=NULL,updated_at=?
        WHERE link_id=? AND user_id=? AND source_url=? AND ${ELIGIBLE_SQL} AND ${CURRENT_LINK_SQL}
          AND ${ACTIVE_KEY_SQL} AND ${CONNECTOR_IDLE_SQL} RETURNING link_id,attempts,lease_until`,
      [
        target ? "running" : "unavailable",
        auth.keyId,
        token,
        target ? now + LEASE_MS : 0,
        key,
        key && domain ? buildPublicUrl(domain, key) : null,
        now,
        candidate.link_id,
        auth.userId,
        candidate.source_url,
        now,
        now,
        ...activeKeyParams(auth, now),
        ...connectorIdleParams(auth, now),
      ],
    );
    if (!row) return null;
    if (target)
      return {
        source: "screenshot",
        linkId: row.link_id,
        userId: auth.userId,
        sourceUrl: candidate.source_url,
        leaseToken: token,
        leaseUntil: row.lease_until,
        attempts: row.attempts,
      };
  }
  return null;
}

export async function renewScreenshot(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  return (
    (
      await executeD1Query(
        `UPDATE screenshot_jobs SET lease_until=?,updated_at=? WHERE ${LIVE_LEASE_SQL} RETURNING link_id`,
        [now + LEASE_MS, now, ...leaseParams(auth, id, token, now)],
      )
    ).length > 0
  );
}

const FAILURE_CODES = [
  "opencli_unavailable",
  "unsupported_opencli_version",
  "screenshot_unavailable",
  "screenshot_too_large",
  "invalid_screenshot",
  "unsafe_screenshot_url",
  "upload_failed",
  "interrupted",
];
export async function failScreenshot(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  code: string,
  now = Date.now(),
): Promise<boolean> {
  return (
    (
      await executeD1Query(
        `UPDATE screenshot_jobs SET state='failed',error_code=?,next_attempt_at=? + MIN(3600000,60000 * (1 << attempts)),
      lease_until=0,r2_key=NULL,public_url=NULL,sha256=NULL,updated_at=? WHERE ${LIVE_LEASE_SQL} RETURNING link_id`,
        [
          FAILURE_CODES.includes(code) ? code : "connector_error",
          now,
          now,
          ...leaseParams(auth, id, token, now),
        ],
      )
    ).length > 0
  );
}

async function readScreenshot(
  body: ReadableStream<Uint8Array>,
  digest: string,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_SCREENSHOT_BYTES) throw new ConnectorError("screenshot_too_large", 413);
      parts.push(value);
    }
    const bytes = Buffer.concat(parts);
    validateScreenshot(bytes);
    if (createHash("sha256").update(bytes).digest("hex") !== digest)
      throw new ConnectorError("digest_mismatch", 400);
    return bytes;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** One bounded upload publishes the preview; replaying a completed PUT is a no-op. */
export async function writeScreenshot(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  digest: string,
  body: ReadableStream<Uint8Array>,
  now = Date.now(),
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    await body.cancel();
    throw new ConnectorError("invalid_screenshot", 400);
  }
  const completed = await executeD1Query(
    `SELECT 1 FROM screenshot_jobs s WHERE link_id=? AND user_id=? AND lease_key_id=? AND lease_token=?
      AND state='complete' AND sha256=? AND ${ACTIVE_KEY_SQL}
      AND EXISTS(SELECT 1 FROM links WHERE id=s.link_id AND user_id=s.user_id AND original_url=s.source_url AND screenshot_url=s.public_url)`,
    [id, auth.userId, auth.keyId, token, digest, ...activeKeyParams(auth, now)],
  );
  if (completed.length) {
    await body.cancel();
    return true;
  }
  // sha256 doubles as the upload lock; concurrent PUTs cannot write the same reservation.
  const [job] = await executeD1Query<ScreenshotRow>(
    `UPDATE screenshot_jobs SET sha256=? WHERE ${LIVE_LEASE_SQL} AND sha256 IS NULL RETURNING *`,
    [digest, ...leaseParams(auth, id, token, now)],
  );
  if (!job) {
    await body.cancel();
    return false;
  }
  try {
    const bytes = await readScreenshot(body, digest);
    // Queue before writing so a crash between R2 and D1 still has durable cleanup.
    await enqueueR2Deletion(job.r2_key, auth.userId, now);
    await uploadBufferToR2(job.r2_key, bytes, "image/webp");
    const finished = Math.max(now, Date.now());
    const result = await executeD1Batch([
      {
        sql: `UPDATE links SET screenshot_url=? WHERE id=? AND user_id=? AND original_url=? AND ${MISSING_PREVIEW_SQL}
          AND EXISTS(SELECT 1 FROM screenshot_jobs WHERE ${LIVE_LEASE_SQL} AND sha256=?) RETURNING id`,
        params: [
          job.public_url,
          id,
          auth.userId,
          job.source_url,
          ...leaseParams(auth, id, token, finished),
          digest,
        ],
      },
      {
        sql: `UPDATE screenshot_jobs SET state='complete',error_code=NULL,lease_until=0,updated_at=?
          WHERE ${LEASE_SQL} AND sha256=?
          AND EXISTS(SELECT 1 FROM links WHERE id=screenshot_jobs.link_id AND user_id=screenshot_jobs.user_id
            AND original_url=screenshot_jobs.source_url AND screenshot_url=screenshot_jobs.public_url) RETURNING link_id`,
        params: [finished, ...leaseParams(auth, id, token, finished), digest],
      },
    ]);
    if ((result[1]?.length ?? 0) > 0) return true;
    await enqueueR2Deletion(job.r2_key, auth.userId);
    return false;
  } catch (error) {
    await enqueueR2Deletion(job.r2_key, auth.userId);
    throw error instanceof ConnectorError ? error : new ConnectorError("upload_failed", 502);
  } finally {
    await executeD1Query(
      `UPDATE screenshot_jobs SET sha256=NULL WHERE link_id=? AND user_id=? AND lease_token=? AND state='running' AND sha256=?`,
      [id, auth.userId, token, digest],
    );
  }
}
