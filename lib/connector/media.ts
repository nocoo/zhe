import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  ConnectorError,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  record,
  verifySignature,
  type XCapture,
} from "@/cli/src/connector/core";
import { executeD1Query } from "@/lib/db/d1-client";
import { uploadStreamToR2 } from "@/lib/r2/client";
import { enqueueR2Deletion } from "@/lib/r2/gc";
import { hashUserId } from "@/models/upload";
import type { ConnectorIdentity } from "./auth";
import { LEASE_SQL, leaseParams } from "./jobs";

export interface MediaDescriptor {
  mediaId: string;
  kind: "video" | "photo" | "poster";
  mime: string;
  size: number;
  sha256: string;
}
type MediaRow = {
  id: string;
  r2_key: string;
  media_id: string;
  mime: string;
  size: number;
  sha256: string;
  state: "reserved" | "uploading" | "verified" | "published";
  lease_token: string;
};
export interface MediaReservation {
  id: string;
  key: string;
  uploaded: boolean;
  skipped?: false;
}

export async function reserveXMedia(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  input: unknown,
  now = Date.now(),
): Promise<MediaReservation | { skipped: true } | null> {
  const [job] = await executeD1Query<{
    post_id: string;
    draft_json: string | null;
    removed_media: string;
  }>(
    `SELECT post_id,draft_json,removed_media FROM x_bookmarks WHERE ${LEASE_SQL}`,
    leaseParams(auth, id, token, now),
  );
  if (!job?.draft_json) return null;
  const raw = record(input);
  const removed = JSON.parse(job.removed_media) as string[];
  if (
    removed.includes(`${raw.mediaId}:${raw.kind}`) ||
    (raw.kind === "poster" && removed.includes(`${raw.mediaId}:video`))
  )
    return { skipped: true };
  const capture = JSON.parse(job.draft_json) as XCapture;
  const source = capture.media.find((m) => m.id === raw.mediaId);
  const extensions: Record<string, string> = {
    "video/mp4": "mp4",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const mime = String(raw.mime);
  const extension = extensions[mime];
  const video = raw.kind === "video";
  if (
    !source ||
    !["photo", "video", "poster"].includes(String(raw.kind)) ||
    !extension ||
    (source.type === "PHOTO" ? raw.kind !== "photo" : raw.kind === "photo") ||
    (video ? mime !== "video/mp4" : !mime.startsWith("image/")) ||
    typeof raw.size !== "number" ||
    !Number.isSafeInteger(raw.size) ||
    raw.size < (video ? 24 : 3) ||
    raw.size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES) ||
    typeof raw.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.sha256)
  )
    throw new ConnectorError("invalid_media", 400);
  const lookup = [id, auth.userId, source.id, raw.kind];
  const [existing] = await executeD1Query<MediaRow>(
    "SELECT * FROM x_media WHERE link_id=? AND user_id=? AND media_id=? AND kind=?",
    lookup,
  );
  if (existing && ["verified", "published"].includes(existing.state))
    return { id: existing.id, key: existing.r2_key, uploaded: true };
  if (existing?.lease_token === token)
    return { id: existing.id, key: existing.r2_key, uploaded: false };
  if (existing)
    await executeD1Query(
      `DELETE FROM x_media WHERE id=? AND EXISTS(SELECT 1 FROM x_bookmarks WHERE ${LEASE_SQL})`,
      [existing.id, ...leaseParams(auth, id, token, now)],
    );
  const salt = process.env.R2_USER_HASH_SALT;
  if (!salt || !process.env.R2_PUBLIC_DOMAIN) throw new ConnectorError("storage_unavailable", 503);
  const assetId = randomUUID();
  const key = `${await hashUserId(auth.userId, salt)}/x/${job.post_id}/${id}/${assetId}.${extension}`;
  const rows = await executeD1Query<MediaRow>(
    `INSERT INTO x_media(id,link_id,user_id,media_id,kind,r2_key,mime,size,sha256,lease_token,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM x_bookmarks WHERE ${LEASE_SQL})
    ON CONFLICT(link_id,media_id,kind) DO NOTHING RETURNING *`,
    [
      assetId,
      id,
      auth.userId,
      source.id,
      raw.kind,
      key,
      mime,
      raw.size,
      raw.sha256,
      token,
      now,
      ...leaseParams(auth, id, token, now),
    ],
  );
  return rows.length ? { id: assetId, key, uploaded: false } : null;
}

async function* verifiedBytes(
  body: ReadableStream<Uint8Array>,
  asset: MediaRow,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  let head = new Uint8Array();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > asset.size) throw new ConnectorError("size_mismatch", 400);
      if (head.length < 32) {
        const next = new Uint8Array(Math.min(32, head.length + value.length));
        next.set(head);
        next.set(value.subarray(0, next.length - head.length), head.length);
        head = next;
      }
      hash.update(value);
      yield value;
    }
    if (size !== asset.size || hash.digest("hex") !== asset.sha256)
      throw new ConnectorError("digest_mismatch", 400);
    verifySignature(head, asset.mime);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function writeXMedia(
  auth: ConnectorIdentity,
  id: number,
  token: string,
  assetId: string,
  body: ReadableStream<Uint8Array>,
  now = Date.now(),
): Promise<boolean> {
  const [asset] = await executeD1Query<MediaRow>(
    `UPDATE x_media SET state='uploading' WHERE id=? AND link_id=? AND user_id=? AND lease_token=? AND state='reserved'
    AND EXISTS(SELECT 1 FROM x_bookmarks WHERE ${LEASE_SQL}) RETURNING *`,
    [assetId, id, auth.userId, token, ...leaseParams(auth, id, token, now)],
  );
  if (!asset) {
    await body.cancel();
    return false;
  }
  try {
    await uploadStreamToR2(
      asset.r2_key,
      Readable.from(verifiedBytes(body, asset)),
      asset.mime,
      asset.size,
      asset.sha256,
    );
    // Do not use the request's old timestamp after a long upload; re-check the live lease.
    const finishedAt = Math.max(now, Date.now());
    const published = await executeD1Query(
      `UPDATE x_media SET state='verified' WHERE id=? AND state='uploading' AND lease_token=?
      AND EXISTS(SELECT 1 FROM x_bookmarks WHERE ${LEASE_SQL}) RETURNING id`,
      [assetId, token, ...leaseParams(auth, id, token, finishedAt)],
    );
    if (!published.length) {
      await executeD1Query(
        "DELETE FROM x_media WHERE id=? AND state='uploading' AND lease_token=?",
        [assetId, token],
      );
      await enqueueR2Deletion(asset.r2_key, auth.userId);
      return false;
    }
    return true;
  } catch (error) {
    await executeD1Query("DELETE FROM x_media WHERE id=? AND state='uploading' AND lease_token=?", [
      assetId,
      token,
    ]);
    // Re-enqueue even if a concurrent link deletion already drained the queue.
    await enqueueR2Deletion(asset.r2_key, auth.userId);
    throw error instanceof ConnectorError ? error : new ConnectorError("upload_failed", 502);
  }
}
