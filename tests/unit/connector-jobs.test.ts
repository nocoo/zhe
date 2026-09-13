import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConnectorSummary, loadXBookmarks, retryXBookmarkAction } from "@/actions/connector";
import { cleanupOrphanFiles, scanStorage } from "@/actions/storage";
import { GET as webhookStatus } from "@/app/api/link/create/[token]/route";
import { PUT as uploadMedia } from "@/app/api/v1/connector/jobs/[id]/media/[assetId]/route";
import { POST as updateJob } from "@/app/api/v1/connector/jobs/[id]/route";
import { POST as poll, GET as status } from "@/app/api/v1/connector/route";
import { normalizeXPost } from "@/cli/src/connector/core";
import { connectorKeyActive } from "@/lib/connector/auth";
import { type MediaReservation, reserveXMedia, writeXMedia } from "@/lib/connector/media";
import * as d1 from "@/lib/db/d1-client";
import { deleteLink as scopedDeleteLink } from "@/lib/db/scoped/links";
import { deleteUpload as scopedDeleteUpload } from "@/lib/db/scoped/uploads";
import * as r2 from "@/lib/r2/client";
import { drainR2Deletions } from "@/lib/r2/gc";
import { hashApiKey } from "@/models/api-key";

vi.mock("@/lib/auth-context", () => ({ requireAuth: async () => "owner" }));

import {
  claimXBookmark,
  completeXBookmark,
  failXBookmark,
  getXBookmarks,
  renewXBookmark,
  stageXCapture,
} from "@/lib/connector/jobs";

function required(value: MediaReservation | { skipped: true } | null): MediaReservation;
function required<T>(value: T | null | undefined): T;
function required<T>(value: T | null | undefined): T {
  assert(value);
  if (typeof value === "object" && "skipped" in value) assert(!value.skipped);
  return value;
}

let db: DatabaseSync;
let storageDir: string;
vi.mock("@/lib/db/d1-client", () => ({
  executeD1Query: async (sql: string, params: SQLInputValue[] = []) =>
    db.prepare(sql).all(...params),
  executeD1Batch: async (statements: { sql: string; params?: SQLInputValue[] }[]) => {
    db.exec("BEGIN");
    try {
      const result = statements.map(({ sql, params = [] }) => db.prepare(sql).all(...params));
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
}));

const now = Date.now();
const identity = { userId: "owner", keyId: "cli-key" };
const other = { userId: "other", keyId: "other-key" };
const postId = "2000000000000000001";
const source = `https://x.com/example/status/${postId}`;
const capture = required(
  normalizeXPost(
    {
      rest_id: postId,
      legacy: { full_text: "Saved text from the user's CLI", created_at: "2026-09-12T00:00:00Z" },
      core: {
        user_results: {
          result: { rest_id: "123", legacy: { screen_name: "example", name: "Example" } },
        },
      },
    },
    postId,
  ),
);

function link(url = source, owner = "owner", slug = crypto.randomUUID()) {
  return Number(
    db
      .prepare(
        "INSERT INTO links (user_id, original_url, slug, created_at) VALUES (?, ?, ?, ?) RETURNING id",
      )
      .get(owner, url, slug, now)?.id,
  );
}
function rows(table: string) {
  return db.prepare(`SELECT * FROM ${table}`).all();
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  storageDir = mkdtempSync(join(tmpdir(), "zhe-connector-test-"));
  vi.stubEnv("LOCAL_R2", "1");
  vi.stubEnv("LOCAL_R2_DIR", storageDir);
  vi.stubEnv("R2_USER_HASH_SALT", "connector-test-salt");
  vi.stubEnv("R2_PUBLIC_DOMAIN", "https://cdn.example.com");
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=OFF");
  for (const file of readdirSync("drizzle/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    // Match scripts/test-stack.ts: these drop columns that only existed in prod.
    if (["0014_drop_discord_bot_settings.sql", "0016_drop_backy_pull_secret.sql"].includes(file))
      continue;
    db.exec(readFileSync(`drizzle/migrations/${file}`, "utf8"));
  }
  for (const id of ["owner", "other"]) db.prepare("INSERT INTO users(id) VALUES (?)").run(id);
  for (const auth of [identity, other])
    db.prepare(
      "INSERT INTO api_keys(id,prefix,key_hash,user_id,name,scopes,created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(
      auth.keyId,
      "zhe_test",
      hashApiKey(`zhe_test_${auth.keyId}`),
      auth.userId,
      "Existing CLI",
      "links:read,connector:write",
      Math.floor(now / 1000),
    );
});
afterEach(() => {
  db.close();
  rmSync(storageDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Connector HTTP boundary uses the same CLI authentication", () => {
  it("reports only actual Connector activity, and keeps the public webhook supported", async () => {
    db.prepare("UPDATE api_keys SET last_used_at=? WHERE id=?").run(
      Math.floor(now / 1000),
      identity.keyId,
    );
    expect((await loadConnectorSummary()).lastSeenAt).toBeNull();
    await status(
      new NextRequest("https://zhe.to/api/v1/connector", {
        headers: { authorization: "Bearer zhe_test_cli-key" },
      }),
    );
    expect((await loadConnectorSummary()).lastSeenAt).toBeGreaterThanOrEqual(now);
    db.prepare("INSERT INTO webhooks(user_id,token,created_at,rate_limit) VALUES(?,?,?,?)").run(
      "owner",
      "synthetic-webhook",
      now,
      5,
    );
    const response = await webhookStatus(
      new Request("https://zhe.to/api/link/create/synthetic-webhook"),
      { params: Promise.resolve({ token: "synthetic-webhook" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Sunset")).toBeNull();
    expect((await response.json()).deprecation).toBeUndefined();
  });
  const headers = { authorization: "Bearer zhe_test_cli-key", "content-type": "application/json" };
  const request = (path = "", body?: unknown, extra: Record<string, string> = {}) =>
    new NextRequest(`https://zhe.to/api/v1/connector${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...headers, ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  it("requires authentication, scope and unexpired capability", async () => {
    expect((await status(new NextRequest("https://zhe.to/api/v1/connector"))).status).toBe(401);
    expect((await status(request())).status).toBe(200);
    db.prepare("UPDATE api_keys SET scopes='links:read' WHERE id=?").run(identity.keyId);
    expect((await status(request())).status).toBe(403);
    db.prepare("UPDATE api_keys SET scopes='connector:write',created_at=0 WHERE id=?").run(
      identity.keyId,
    );
    expect((await status(request())).status).toBe(403);
  });
  it("polls a saved bookmark and completes text with an opaque lease", async () => {
    const id = link();
    const reply = await poll(request("", {}));
    expect(reply.status).toBe(200);
    const { job } = await reply.json();
    expect(job.linkId).toBe(id);
    const context = { params: Promise.resolve({ id: String(id) }) };
    expect(
      (await updateJob(request(`/jobs/${id}`, { action: "capture", capture }), context)).status,
    ).toBe(400);
    const leased = { "x-connector-lease": job.leaseToken };
    expect(
      (await updateJob(request(`/jobs/${id}`, { action: "capture", capture }, leased), context))
        .status,
    ).toBe(200);
    expect(
      (await updateJob(request(`/jobs/${id}`, { action: "renew" }, leased), context)).status,
    ).toBe(200);
    expect(
      (await updateJob(request(`/jobs/${id}`, { action: "complete" }, leased), context)).status,
    ).toBe(200);
    expect(
      (await updateJob(request(`/jobs/${id}`, { action: "complete" }, leased), context)).status,
    ).toBe(409);
    expect((await getXBookmarks("owner", [id]))[0]?.state).toBe("complete");
  });
  it("returns bounded sanitized errors for invalid bodies and missing media", async () => {
    const context = { params: Promise.resolve({ id: "1" }) };
    const lease = { "x-connector-lease": crypto.randomUUID() };
    const badJson = new NextRequest("https://zhe.to/api/v1/connector/jobs/1", {
      method: "POST",
      headers: { ...headers, ...lease },
      body: "{",
    });
    expect((await updateJob(badJson, context)).status).toBe(400);
    expect(
      (await updateJob(request("/jobs/1", { action: "unknown" }, lease), context)).status,
    ).toBe(400);
    expect(
      (
        await updateJob(
          request("/jobs/1", { action: "capture", capture: "x".repeat(512_001) }, lease),
          context,
        )
      ).status,
    ).toBe(413);
    const upload = new NextRequest("https://zhe.to/api/v1/connector/jobs/1/media/id", {
      method: "PUT",
      headers: { ...headers, ...lease },
      body: "test",
    });
    expect(
      (
        await uploadMedia(upload, {
          params: Promise.resolve({ id: "1", assetId: crypto.randomUUID() }),
        })
      ).status,
    ).toBe(409);
  });
});

describe("shared CLI authorization", () => {
  it("claims the current source if a link changes between selection and lease acquisition", async () => {
    const id = link();
    const nextPost = "2000000000000000002";
    const nextSource = `https://x.com/example/status/${nextPost}`;
    const original = d1.executeD1Query;
    let changed = false;
    vi.spyOn(d1, "executeD1Query").mockImplementation(async (sql, params) => {
      const result = await original(sql, params);
      if (!changed && sql.startsWith("SELECT * FROM x_bookmarks WHERE user_id") && result.length) {
        changed = true;
        db.prepare("UPDATE links SET original_url=? WHERE id=?").run(nextSource, id);
        // Another poll discovers the replacement before this poll acquires its lease.
        db.prepare(
          "INSERT INTO x_bookmarks(link_id,user_id,source_url,updated_at) VALUES(?,?,?,?)",
        ).run(id, "owner", nextSource, now);
      }
      return result;
    });
    const job = required(await claimXBookmark(identity, now));
    expect(job.postId).toBe(nextPost);
    expect(job.sourceUrl).toBe(`https://x.com/i/status/${nextPost}`);
    expect(rows("x_bookmarks")[0]).toMatchObject({ source_url: nextSource, post_id: nextPost });
  });
  it.each([false, true])(
    "makes the last expired lease manually retryable (published text=%s)",
    async (published) => {
      const id = link();
      const job = required(await claimXBookmark(identity, now));
      db.prepare("UPDATE x_bookmarks SET attempts=5, result_json=? WHERE link_id=?").run(
        published ? JSON.stringify(capture) : null,
        id,
      );
      expect(await claimXBookmark(identity, job.leaseUntil - 1)).toBeNull();
      expect(rows("x_bookmarks")[0]?.state).toBe("running");
      const later = job.leaseUntil + 1;
      vi.spyOn(Date, "now").mockReturnValue(later);
      expect(await claimXBookmark(identity, later)).toBeNull();
      expect(rows("x_bookmarks")[0]).toMatchObject({
        state: published ? "partial" : "failed",
        error_code: "interrupted",
      });
      expect(await retryXBookmarkAction(id)).toEqual({ success: true });
      expect(required(await claimXBookmark(identity, later)).attempts).toBe(1);
    },
  );
  it("uses an existing scoped API key, with an owner and a 30-day Connector lifetime", async () => {
    expect(await connectorKeyActive(identity, now)).toBe(true);
    expect(await connectorKeyActive({ ...identity, userId: "other" }, now)).toBe(false);
    expect(await connectorKeyActive(identity, now + 30 * 86400_000)).toBe(false);
    db.prepare("UPDATE api_keys SET scopes='links:read' WHERE id=?").run(identity.keyId);
    expect(await connectorKeyActive(identity, now)).toBe(false);
  });
  it("honors revocation at every task mutation", async () => {
    link();
    const job = required(await claimXBookmark(identity, now));
    db.prepare("UPDATE api_keys SET revoked_at=? WHERE id=?").run(now / 1000, identity.keyId);
    expect(await connectorKeyActive(identity, now)).toBe(false);
    expect(await renewXBookmark(identity, job.linkId, job.leaseToken, now)).toBe(false);
    expect(await stageXCapture(identity, job.linkId, job.leaseToken, capture, now)).toBe(false);
    expect(await completeXBookmark(identity, job.linkId, job.leaseToken, now)).toBe(false);
  });
});

describe("existing R2 uploads, publication and cascading deletion", () => {
  const mediaId = "2000000000000000002";
  const bytes = new Uint8Array(64);
  bytes.set([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const videoCapture = {
    tweet: {
      ...capture.tweet,
      media: [
        {
          id: mediaId,
          type: "VIDEO" as const,
          url: `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/1280x720/test.mp4`,
        },
      ],
    },
    media: [
      {
        id: mediaId,
        type: "VIDEO" as const,
        url: `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/1280x720/test.mp4`,
      },
    ],
  };
  const descriptor = {
    mediaId,
    kind: "video" as const,
    mime: "video/mp4",
    size: bytes.length,
    sha256: sha,
  };
  const stream = (value = bytes) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(value.slice(0, 7));
        c.enqueue(value.slice(7));
        c.close();
      },
    });
  async function prepare() {
    const id = link();
    const job = required(await claimXBookmark(identity, now));
    await stageXCapture(identity, id, job.leaseToken, videoCapture, now);
    const asset = required(await reserveXMedia(identity, id, job.leaseToken, descriptor, now));
    return { id, job, asset };
  }
  it("removes a completed upload immediately if its lease expires during streaming", async () => {
    const { id, job, asset } = await prepare();
    const original = r2.uploadStreamToR2;
    vi.spyOn(r2, "uploadStreamToR2").mockImplementation(async (...args) => {
      await original(...args);
      vi.spyOn(Date, "now").mockReturnValue(now + 180_001);
    });
    expect(await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now)).toBe(false);
    expect(rows("x_media")).toHaveLength(0);
    expect(await drainR2Deletions("owner", now + 180_001)).toBe(1);
    expect(await r2.listR2Objects()).toHaveLength(0);
  });
  it("does not publish when the lease expires while reading publication prerequisites", async () => {
    const { id, job, asset } = await prepare();
    await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now);
    const original = d1.executeD1Query;
    vi.spyOn(d1, "executeD1Query").mockImplementation(async (sql, params) => {
      const result = await original(sql, params);
      if (sql.includes("SELECT media_id,kind"))
        vi.spyOn(Date, "now").mockReturnValue(now + 180_001);
      return result;
    });
    expect(await completeXBookmark(identity, id, job.leaseToken, now)).toBe(false);
    expect(rows("uploads")).toHaveLength(0);
    expect((await getXBookmarks("owner", [id]))[0]?.tweet).toBeNull();
  });
  it("keeps an explicitly deleted video removed when retrying another missing attachment", async () => {
    const { id, job, asset } = await prepare();
    const extended = structuredClone(videoCapture);
    extended.tweet.media.push({
      ...required(extended.tweet.media[0]),
      id: "2000000000000000003",
      url: "https://video.twimg.com/ext_tw_video/2000000000000000003/pu/vid/1280x720/test.mp4",
    });
    extended.media = extended.tweet.media;
    await stageXCapture(identity, id, job.leaseToken, extended, now);
    await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now);
    await completeXBookmark(identity, id, job.leaseToken, now);
    expect((await getXBookmarks("owner", [id]))[0]?.state).toBe("partial");
    await scopedDeleteUpload("owner", Number(required(rows("uploads")[0]).id));
    const retry = required(await claimXBookmark(identity, now + 300_000));
    await stageXCapture(identity, id, retry.leaseToken, extended, now + 300_000);
    expect(await reserveXMedia(identity, id, retry.leaseToken, descriptor, now + 300_000)).toEqual({
      skipped: true,
    });
    await completeXBookmark(identity, id, retry.leaseToken, now + 300_000);
    expect(rows("uploads")).toHaveLength(0);
    expect((await getXBookmarks("owner", [id]))[0]?.tweet?.media).toEqual([]);
  });
  it.each(["image/png", "image/webp"])(
    "preserves the actual photo extension for %s in storage",
    async (mime) => {
      const id = link();
      const job = required(await claimXBookmark(identity, now));
      const photoCapture = structuredClone(capture);
      photoCapture.tweet.media = [
        { id: mediaId, type: "PHOTO", url: "https://pbs.twimg.com/media/test.png" },
      ];
      await stageXCapture(identity, id, job.leaseToken, photoCapture, now);
      const imageBytes = new Uint8Array(32);
      if (mime === "image/png") imageBytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
      else {
        imageBytes.set(new TextEncoder().encode("RIFF"));
        imageBytes.set(new TextEncoder().encode("WEBP"), 8);
      }
      const asset = required(
        await reserveXMedia(
          identity,
          id,
          job.leaseToken,
          {
            ...descriptor,
            kind: "photo",
            mime,
            size: imageBytes.length,
            sha256: createHash("sha256").update(imageBytes).digest("hex"),
          },
          now,
        ),
      );
      await writeXMedia(identity, id, job.leaseToken, asset.id, stream(imageBytes), now);
      await completeXBookmark(identity, id, job.leaseToken, now);
      expect(required(rows("uploads")[0]).file_name).toBe(`${mediaId}.${mime.split("/")[1]}`);
    },
  );
  it("protects a verified but unpublished object in the existing orphan scanner and cleaner", async () => {
    const { id, job, asset } = await prepare();
    await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now);
    const scan = await scanStorage();
    expect(scan.data?.r2.summary.orphanFiles).toBe(0);
    const clean = await cleanupOrphanFiles([asset.key]);
    expect(clean.data).toMatchObject({ skipped: 1, deleted: 0 });
    expect(await r2.listR2Objects()).toHaveLength(1);
  });
  it.each(["link", "file"])(
    "drains queued objects from the shared ScopedDB %s deletion path",
    async (target) => {
      const { id, job, asset } = await prepare();
      await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now);
      await completeXBookmark(identity, id, job.leaseToken, now);
      const upload = required(rows("uploads")[0]);
      if (target === "link") expect(await scopedDeleteLink("owner", id)).toBe(true);
      else expect(await scopedDeleteUpload("owner", Number(upload.id))).toBe(true);
      expect(rows("x_media")).toHaveLength(0);
      expect(await r2.listR2Objects()).toHaveLength(0);
    },
  );
  it("reserves bounded objects, verifies bytes, and publishes into the existing uploads list", async () => {
    const { id, job, asset } = await prepare();
    expect(asset.key).toMatch(/^[a-f0-9]{12}\/x\/\d+\/\d+\/[a-f0-9-]+\.mp4$/);
    expect(rows("uploads")).toHaveLength(0);
    expect(await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now)).toBe(true);
    expect(rows("uploads")).toHaveLength(0);
    expect(await completeXBookmark(identity, id, job.leaseToken, now)).toBe(true);
    expect(rows("uploads")).toHaveLength(1);
    const result = required((await getXBookmarks("owner", [id]))[0]);
    expect(result.tweet?.media[0]?.url).toBe(`https://cdn.example.com/${asset.key}`);
    expect(result.state).toBe("complete");
    expect((await r2.listR2Objects()).map((o) => o.size)).toEqual([bytes.length]);
  });
  it("keeps text when media fails and reuses already verified files on retry", async () => {
    const { id, job, asset } = await prepare();
    await completeXBookmark(identity, id, job.leaseToken, now);
    expect((await getXBookmarks("owner", [id]))[0]).toMatchObject({
      state: "partial",
      tweet: { text: capture.tweet.text, media: [] },
    });
    const retry = required(await claimXBookmark(identity, now + 300_000));
    await stageXCapture(identity, id, retry.leaseToken, videoCapture, now + 300_000);
    const replacement = required(
      await reserveXMedia(identity, id, retry.leaseToken, descriptor, now + 300_000),
    );
    expect(replacement.id).not.toBe(asset.id);
    await writeXMedia(identity, id, retry.leaseToken, replacement.id, stream(), now + 300_000);
    const repeated = required(
      await reserveXMedia(identity, id, retry.leaseToken, descriptor, now + 300_000),
    );
    expect(repeated.id).toBe(replacement.id);
    expect(repeated.uploaded).toBe(true);
    await completeXBookmark(identity, id, retry.leaseToken, now + 300_000);
    expect(rows("uploads")).toHaveLength(1);
  });
  it.each(["digest", "truncated", "signature"])(
    "rejects invalid media before publication: %s",
    async (problem) => {
      const { id, job, asset } = await prepare();
      const body = problem === "truncated" ? bytes.slice(0, 50) : bytes.slice();
      if (problem === "digest") body[60] = 1;
      if (problem === "signature") body[4] = 0;
      await expect(
        writeXMedia(identity, id, job.leaseToken, asset.id, stream(body), now),
      ).rejects.toThrow();
      expect(rows("uploads")).toHaveLength(0);
      await drainR2Deletions("owner", now);
      expect(await r2.listR2Objects()).toEqual([]);
    },
  );
  it("rejects unlisted media, oversize uploads, wrong owner and expired leases", async () => {
    const { id, job, asset } = await prepare();
    await expect(
      reserveXMedia(identity, id, job.leaseToken, { ...descriptor, mediaId: "9000" }, now),
    ).rejects.toThrow("invalid_media");
    await expect(
      reserveXMedia(
        identity,
        id,
        job.leaseToken,
        { ...descriptor, size: 64 * 1024 * 1024 + 1 },
        now,
      ),
    ).rejects.toThrow("invalid_media");
    expect(await writeXMedia(other, id, job.leaseToken, asset.id, stream(), now)).toBe(false);
    expect(await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now + 180_000)).toBe(
      false,
    );
    expect(await r2.listR2Objects()).toEqual([]);
  });
  it.each(["bookmark", "video-file", "url", "user"])(
    "cascades video and poster references when deleting %s",
    async (target) => {
      const { id, job, asset } = await prepare();
      await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now);
      const posterBytes = new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0]);
      const poster = required(
        await reserveXMedia(
          identity,
          id,
          job.leaseToken,
          {
            ...descriptor,
            kind: "poster",
            mime: "image/jpeg",
            size: posterBytes.length,
            sha256: createHash("sha256").update(posterBytes).digest("hex"),
          },
          now,
        ),
      );
      await writeXMedia(identity, id, job.leaseToken, poster.id, stream(posterBytes), now);
      await completeXBookmark(identity, id, job.leaseToken, now);
      expect(rows("uploads")).toHaveLength(2);
      if (target === "bookmark") db.prepare("DELETE FROM links WHERE id=?").run(id);
      if (target === "video-file") db.prepare("DELETE FROM uploads WHERE key=?").run(asset.key);
      if (target === "user") db.prepare("DELETE FROM users WHERE id=?").run("owner");
      if (target === "url")
        db.prepare("UPDATE links SET original_url=? WHERE id=?").run("https://example.com/new", id);
      expect(rows("x_media")).toHaveLength(0);
      expect(rows("uploads")).toHaveLength(0);
      expect(rows("r2_deletions")).toHaveLength(2);
      expect(await drainR2Deletions("owner", now)).toBe(2);
      expect(await r2.listR2Objects()).toEqual([]);
      expect((await getXBookmarks("owner", [id]))[0]?.tweet?.media ?? []).toEqual([]);
    },
  );
  it("retains cleanup work after an R2 failure and protects reserved files from collection", async () => {
    const { id, job, asset } = await prepare();
    await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now);
    expect(await drainR2Deletions("owner", now)).toBe(0);
    expect((await r2.listR2Objects()).length).toBe(1);
    db.prepare("DELETE FROM links WHERE id=?").run(id);
    const failing = vi.spyOn(r2, "deleteR2Object").mockRejectedValueOnce(new Error("offline"));
    expect(await drainR2Deletions("owner", now)).toBe(0);
    expect(rows("r2_deletions")).toHaveLength(1);
    failing.mockRestore();
    expect(await drainR2Deletions("other", now)).toBe(0);
    expect(await drainR2Deletions("owner", now)).toBe(1);
  });
});

describe("discover saved bookmarks, then enrich", () => {
  it("serves the owner's cards and retries failed jobs without stealing live leases", async () => {
    const id = link();
    const job = required(await claimXBookmark(identity, now));
    expect((await retryXBookmarkAction(id)).success).toBe(false);
    await failXBookmark(identity, id, job.leaseToken, "needs_login", now);
    expect((await loadXBookmarks([id])).data?.[0]?.state).toBe("failed");
    expect((await retryXBookmarkAction(id)).success).toBe(true);
    expect(required(await claimXBookmark(identity, now)).attempts).toBe(1);
    expect((await loadXBookmarks([-1])).success).toBe(false);
    expect((await retryXBookmarkAction(-1)).success).toBe(false);
  });
  it("discovers all save entry points and the backlog without changing saved bookmarks", async () => {
    const ids = [
      link(source, "owner", "webhook"),
      link(`https://twitter.com/example/status/${postId}?s=20`, "owner", "manual"),
      link(`https://x.com/i/web/status/${postId}`, "owner", "api"),
    ];
    link("https://example.com/article");
    link(source, "other");
    const before = rows("links");
    const jobs = await Promise.all(ids.map(() => claimXBookmark(identity, now)));
    expect(new Set(jobs.map((j) => j?.linkId))).toEqual(new Set(ids));
    expect(jobs.every((j) => j?.postId === postId && j.userId === "owner")).toBe(true);
    expect(await claimXBookmark(identity, now)).toBeNull();
    expect(rows("links")).toEqual(before);
  });
  it("does not accept lookalike domains, malformed post paths or another owner's jobs", async () => {
    link("https://x.com.attacker.invalid/user/status/123");
    link("https://x.com/user/status/123bad");
    const wanted = link();
    const job = required(await claimXBookmark(identity, now));
    expect(job?.linkId).toBe(wanted);
    expect(await renewXBookmark(other, wanted, job.leaseToken, now)).toBe(false);
    expect(await stageXCapture(other, wanted, job.leaseToken, capture, now)).toBe(false);
    expect(await getXBookmarks("other", [wanted])).toEqual([]);
  });
  it("supports text-only completion and makes it visible only to the owner", async () => {
    const id = link();
    const job = required(await claimXBookmark(identity, now));
    expect(await completeXBookmark(identity, id, job.leaseToken, now)).toBe(false);
    expect(await stageXCapture(identity, id, job.leaseToken, capture, now)).toBe(true);
    expect((await getXBookmarks("owner", [id]))[0]?.tweet).toBeNull();
    expect(await completeXBookmark(identity, id, job.leaseToken, now)).toBe(true);
    expect((await getXBookmarks("owner", [id]))[0]).toMatchObject({
      linkId: id,
      state: "complete",
      tweet: { text: capture.tweet.text, media: [] },
    });
    expect(rows("uploads")).toHaveLength(0);
    expect(await claimXBookmark(identity, now + 1_000_000)).toBeNull();
  });
  it("renews a lease, reclaims offline work, and rejects late results", async () => {
    const id = link();
    const first = required(await claimXBookmark(identity, now));
    expect(await renewXBookmark(identity, id, first.leaseToken, now + 100_000)).toBe(true);
    expect(await claimXBookmark(identity, now + 200_000)).toBeNull();
    const second = required(await claimXBookmark(identity, now + 300_000));
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(await stageXCapture(identity, id, first.leaseToken, capture, now + 300_000)).toBe(false);
    expect(await completeXBookmark(identity, id, first.leaseToken, now + 300_000)).toBe(false);
  });
  it.each(["delete", "change-url"])(
    "invalidates in-flight work when the bookmark changes: %s",
    async (operation) => {
      const id = link();
      const job = required(await claimXBookmark(identity, now));
      await stageXCapture(identity, id, job.leaseToken, capture, now);
      if (operation === "delete") db.prepare("DELETE FROM links WHERE id=?").run(id);
      else
        db.prepare("UPDATE links SET original_url=? WHERE id=?").run("https://example.com/new", id);
      expect(await completeXBookmark(identity, id, job.leaseToken, now)).toBe(false);
      expect(rows("x_bookmarks")).toEqual([]);
    },
  );
  it("automatically retries with backoff and stops after a bounded number of failures", async () => {
    link();
    let time = now;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const job = required(await claimXBookmark(identity, time));
      expect(job.attempts).toBe(attempt);
      expect(await failXBookmark(identity, job.linkId, job.leaseToken, "needs_login", time)).toBe(
        true,
      );
      expect(await claimXBookmark(identity, time + 1)).toBeNull();
      time += 3_600_000;
    }
    expect(await claimXBookmark(identity, time)).toBeNull();
  });
  it("refuses capture from a different post", async () => {
    const id = link();
    const job = required(await claimXBookmark(identity, now));
    await expect(
      stageXCapture(
        identity,
        id,
        job.leaseToken,
        { ...capture, tweet: { ...capture.tweet, id: "9000" } },
        now,
      ),
    ).rejects.toThrow("invalid_capture");
  });
});
