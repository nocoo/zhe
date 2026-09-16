import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ApiClient } from "@/cli/src/api/client";
import { normalizeXPost } from "@/cli/src/connector/core";
import type { MediaReservation } from "@/cli/src/connector/types";
import { unwrap } from "../../test-utils";
import { authenticatedFetch, getBaseUrl } from "../helpers/api-client";
import {
  cleanupTestData,
  executeD1,
  queryD1,
  seedApiKey,
  seedTestUser,
  seedWebhook,
} from "../helpers/seed";

const owner = "api-connector-owner";
const other = "api-connector-other";
const postId = "2000000000000000001";
const mediaId = "2000000000000000002";
const source = `https://x.com/example/status/${postId}`;
const capture = unwrap(
  normalizeXPost(
    {
      rest_id: postId,
      legacy: { full_text: "Synthetic HTTP post", created_at: "2026-09-12T00:00:00Z" },
      core: {
        user_results: {
          result: { rest_id: "1", legacy: { screen_name: "example", name: "Example" } },
        },
      },
    },
    postId,
  ),
);
let key: string;
let wrongKey: string;
let readKey: string;
let client: ApiClient;
let token: string;
let dir: string;

beforeAll(async () => {
  await cleanupTestData(owner);
  await cleanupTestData(other);
  await seedTestUser(owner);
  await seedTestUser(other);
  key = await seedApiKey(owner, {
    scopes: "links:read,links:write,uploads:read,uploads:write,connector:write",
  });
  wrongKey = await seedApiKey(other, { scopes: "connector:write" });
  readKey = await seedApiKey(owner, { scopes: "links:read" });
  client = new ApiClient(key, undefined, `${getBaseUrl()}/api/v1`);
  token = (await seedWebhook({ userId: owner })).token;
  dir = await mkdtemp(join(tmpdir(), "zhe-http-connector-"));
});
afterEach(async () => {
  for (const row of await queryD1<{ id: number }>("SELECT id FROM links WHERE user_id=?", [owner]))
    await client.deleteLink(row.id);
});
afterAll(async () => {
  await cleanupTestData(owner);
  await cleanupTestData(other);
  await rm(dir, { recursive: true, force: true });
});

describe("saved links enhanced through the shared CLI HTTP interface", () => {
  it("collects GitHub snapshots through negotiated CLI jobs and atomically preserves README text", async () => {
    const saved = await client.createLink({ url: "https://github.com/octocat/Hello-World" });
    expect((await client.claimXJob()).job).toBeNull();
    const job = unwrap((await client.claimConnectorJob()).job);
    expect(job).toMatchObject({ source: "github", linkId: saved.link.id });
    const repository = {
      sourceFullName: "octocat/Hello-World",
      fullName: "octocat/Hello-World",
      description: "Saved GitHub repository",
      stars: 451,
      commits: 217,
      forks: 23,
      language: "TypeScript",
      defaultBranch: "main",
      pushedAt: "2026-09-12T00:00:00Z",
      archived: false,
      license: "MIT",
      topics: ["bookmarks"],
      readmePath: "README.md",
      readme: `# Full README\n${"Full content\n".repeat(50_000)}END`,
    };
    const outsider = new ApiClient(wrongKey, undefined, `${getBaseUrl()}/api/v1`);
    await expect(
      outsider.connectorAction(job, { action: "complete", repository }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      client.connectorAction(job, {
        action: "complete",
        repository: { ...repository, commits: -1 },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await client.connectorAction(job, { action: "renew" });
    await client.connectorAction(job, { action: "complete", repository });
    const [row] = await queryD1<{ result_json: string }>(
      "SELECT result_json FROM github_bookmarks WHERE link_id=? AND user_id=?",
      [job.linkId, owner],
    );
    expect(JSON.parse(unwrap(row).result_json)).toEqual(repository);
    expect((await client.getLink(job.linkId)).link.metaTitle).toBe(repository.fullName);
    await client.deleteLink(job.linkId);
    expect(
      await queryD1("SELECT link_id FROM github_bookmarks WHERE link_id=?", [job.linkId]),
    ).toEqual([]);
    await expect(
      client.connectorAction(job, { action: "complete", repository }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("requires the CLI capability while accepting webhook saves without an authorization header", async () => {
    expect((await fetch(`${getBaseUrl()}/api/v1/connector`)).status).toBe(401);
    expect((await authenticatedFetch(`${getBaseUrl()}/api/v1/connector`, readKey)).status).toBe(
      403,
    );
    const saved = await fetch(`${getBaseUrl()}/api/link/create/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: source }),
    });
    expect(saved.status).toBe(201);
    expect(saved.headers.get("Sunset")).toBeNull();
    expect(await queryD1("SELECT * FROM x_bookmarks WHERE user_id=?", [owner])).toEqual([]);
    const claims = await Promise.all([client.claimXJob(), client.claimXJob()]);
    const jobs = claims.flatMap((r) => (r.job ? [r.job] : []));
    expect(jobs).toHaveLength(1);
    const job = unwrap(jobs[0]);
    const outsider = new ApiClient(wrongKey, undefined, `${getBaseUrl()}/api/v1`);
    await expect(
      outsider.connectorAction(job, { action: "capture", capture }),
    ).rejects.toMatchObject({ status: 409 });
    await client.connectorAction(job, { action: "capture", capture });
    await client.connectorAction(job, { action: "complete" });
    expect((await client.getLink(job.linkId)).link.metaDescription).toBe(capture.tweet.text);
    expect((await client.claimXJob()).job).toBeNull();
  });

  it.each([64, 12 * 1024 * 1024])(
    "streams a %i-byte video and poster, serves Range, and cascades file removal",
    async (size) => {
      const saved = await client.createLink({ url: source });
      const job = unwrap((await client.claimXJob()).job);
      expect(job.linkId).toBe(saved.link.id);
      const videoCapture = structuredClone(capture);
      videoCapture.tweet.media = [
        {
          id: mediaId,
          type: "VIDEO",
          url: `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/1280x720/test.mp4`,
          width: 1280,
          height: 720,
        },
      ];
      await client.connectorAction(job, { action: "capture", capture: videoCapture });
      const bytes = new Uint8Array(size);
      bytes.set([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const file = { path: join(dir, "test.mp4"), mime: "video/mp4", size: bytes.length, sha256 };
      await writeFile(file.path, bytes);
      const { asset } = await client.connectorAction<{ asset: MediaReservation }>(job, {
        action: "reserve",
        media: { mediaId, kind: "video", ...file },
      });
      await client.uploadXMedia(job, asset, file);
      expect(await queryD1("SELECT id FROM uploads WHERE user_id=?", [owner])).toEqual([]);
      const repeated = await client.connectorAction<{ asset: MediaReservation }>(job, {
        action: "reserve",
        media: { mediaId, kind: "video", ...file },
      });
      expect(repeated.asset).toMatchObject({ id: asset.id, uploaded: true });
      const jpg = new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0]);
      const posterFile = {
        path: join(dir, "poster.jpg"),
        mime: "image/jpeg",
        size: jpg.length,
        sha256: createHash("sha256").update(jpg).digest("hex"),
      };
      await writeFile(posterFile.path, jpg);
      const poster = await client.connectorAction<{ asset: MediaReservation }>(job, {
        action: "reserve",
        media: { mediaId, kind: "poster", ...posterFile },
      });
      await client.uploadXMedia(job, poster.asset, posterFile);
      await client.connectorAction(job, { action: "complete" });
      const uploads = await queryD1<{ id: number; public_url: string; key: string }>(
        "SELECT * FROM uploads WHERE user_id=?",
        [owner],
      );
      expect(uploads).toHaveLength(2);
      const video = unwrap(uploads.find((u) => u.key === asset.key));
      const range = await fetch(video.public_url, { headers: { Range: "bytes=8-15" } });
      expect(range.status).toBe(206);
      expect(range.headers.get("content-type")).toBe("video/mp4");
      expect(range.headers.get("content-range")).toBe(`bytes 8-15/${size}`);
      expect(new Uint8Array(await range.arrayBuffer())).toEqual(bytes.slice(8, 16));
      const deleted = await authenticatedFetch(`${getBaseUrl()}/api/v1/uploads/${video.id}`, key, {
        method: "DELETE",
      });
      expect(deleted.status).toBe(200);
      expect(await queryD1("SELECT * FROM x_media WHERE user_id=?", [owner])).toEqual([]);
      expect(await queryD1("SELECT * FROM uploads WHERE user_id=?", [owner])).toEqual([]);
      for (const upload of uploads) expect((await fetch(upload.public_url)).status).toBe(404);
      expect((await client.getLink(job.linkId)).link.id).toBe(job.linkId);
    },
  );

  it("rejects invalid digests and late writes after a bookmark URL changes", async () => {
    await client.createLink({ url: source });
    const job = unwrap((await client.claimXJob()).job);
    const photo = structuredClone(capture);
    photo.tweet.media = [
      { id: mediaId, type: "PHOTO", url: "https://pbs.twimg.com/media/test.jpg" },
    ];
    await client.connectorAction(job, { action: "capture", capture: photo });
    const file = {
      path: join(dir, "invalid.jpg"),
      mime: "image/jpeg",
      size: 8,
      sha256: "a".repeat(64),
    };
    await writeFile(file.path, new Uint8Array(8));
    const { asset } = await client.connectorAction<{ asset: MediaReservation }>(job, {
      action: "reserve",
      media: { mediaId, kind: "photo", ...file },
    });
    await expect(client.uploadXMedia(job, asset, file)).rejects.toMatchObject({ status: 400 });
    await client.updateLink(job.linkId, { originalUrl: "https://example.com/article" });
    await expect(client.connectorAction(job, { action: "complete" })).rejects.toMatchObject({
      status: 409,
    });
    expect(await queryD1("SELECT * FROM x_bookmarks WHERE user_id=?", [owner])).toEqual([]);
  });

  it("keeps old keys permanent and enforces an explicit expiry across Connector and ordinary APIs", async () => {
    const permanent = await seedApiKey(owner, { scopes: "links:read,connector:write" });
    const keyHash = createHash("sha256").update(permanent).digest("hex");
    await executeD1("UPDATE api_keys SET created_at=0 WHERE key_hash=?", [keyHash]);
    const old = new ApiClient(permanent, undefined, `${getBaseUrl()}/api/v1`);
    expect((await old.connectorStatus()).expiresAt).toBeNull();
    expect((await old.listLinks()).links).toEqual([]);
    const future = Math.floor(Date.now() / 1000) + 86400;
    await executeD1("UPDATE api_keys SET expires_at=? WHERE key_hash=?", [future, keyHash]);
    expect((await old.connectorStatus()).expiresAt).toBe(future * 1000);
    expect((await old.listLinks()).links).toEqual([]);
    await executeD1("UPDATE api_keys SET expires_at=? WHERE key_hash=?", [
      Math.floor(Date.now() / 1000),
      keyHash,
    ]);
    await expect(old.connectorStatus()).rejects.toMatchObject({ status: 401 });
    await expect(old.listLinks()).rejects.toMatchObject({ status: 401 });
    await executeD1("UPDATE api_keys SET expires_at=NULL WHERE key_hash=?", [keyHash]);
    expect((await old.connectorStatus()).expiresAt).toBeNull();
    expect((await old.listLinks()).links).toEqual([]);
  });
});
