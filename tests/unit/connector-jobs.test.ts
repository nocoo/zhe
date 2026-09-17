import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadConnectorSummary,
  loadScreenshotPreviews,
  loadXBookmarks,
  retryXBookmarkAction,
  updateXMediaDimensionsAction,
} from "@/actions/connector";
import {
  loadGitHubBookmarks,
  loadGitHubReadme,
  retryGitHubBookmarkAction,
} from "@/actions/github-connector";
import { cleanupOrphanFiles, scanStorage } from "@/actions/storage";
import { GET as webhookStatus } from "@/app/api/link/create/[token]/route";
import { POST as updateGitHubJob } from "@/app/api/v1/connector/github/jobs/[id]/route";
import { PUT as uploadMedia } from "@/app/api/v1/connector/jobs/[id]/media/[assetId]/route";
import { POST as updateJob } from "@/app/api/v1/connector/jobs/[id]/route";
import { POST as poll, GET as status } from "@/app/api/v1/connector/route";
import {
  POST as updateScreenshotJob,
  PUT as uploadScreenshot,
} from "@/app/api/v1/connector/screenshot/jobs/[id]/route";
import { normalizeXPost, type XCapture } from "@/cli/src/connector/core";
import * as authContext from "@/lib/auth-context";
import { connectorKeyActive } from "@/lib/connector/auth";
import {
  claimGitHubBookmark,
  completeGitHubBookmark,
  failGitHubBookmark,
  getGitHubBookmarks,
  renewGitHubBookmark,
} from "@/lib/connector/github-jobs";
import { type MediaReservation, reserveXMedia, writeXMedia } from "@/lib/connector/media";
import { claimConnectorJob } from "@/lib/connector/scheduler";
import {
  claimScreenshot,
  failScreenshot,
  renewScreenshot,
  writeScreenshot,
} from "@/lib/connector/screenshot-jobs";
import * as d1 from "@/lib/db/d1-client";
import { ScopedDB } from "@/lib/db/scoped";
import {
  deleteLink as scopedDeleteLink,
  updateLink as scopedUpdateLink,
} from "@/lib/db/scoped/links";
import { deleteUpload as scopedDeleteUpload } from "@/lib/db/scoped/uploads";
import * as r2 from "@/lib/r2/client";
import { drainR2Deletions, enqueueR2Deletion } from "@/lib/r2/gc";
import { hashApiKey } from "@/models/api-key";
import { hashUserId } from "@/models/upload";

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

const repository = {
  sourceFullName: "octocat/Hello-World",
  fullName: "octocat/Hello-World",
  description: "A repository",
  stars: 123,
  commits: 84,
  forks: 9,
  language: "TypeScript",
  defaultBranch: "main",
  pushedAt: "2026-09-12T00:00:00Z",
  archived: false,
  license: "MIT",
  topics: ["bookmarks"],
  readme: `# Hello\n${"全文与代码\n".repeat(1000)}THE END`,
  readmePath: ".github/README.md",
};

const screenshot = readFileSync("cli/tests/fixtures/screenshot.webp");
const screenshotDigest = createHash("sha256").update(screenshot).digest("hex");
const screenshotBody = (bytes = screenshot) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });

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

describe("serialized webpage previews", () => {
  it("discovers missing previews, excluding entire special sites and existing screenshots", async () => {
    const excluded = [
      "https://x.com",
      "https://mobile.twitter.com/person",
      "https://x.com/i/article/1",
      "https://github.com/",
      "https://docs.github.com/en",
      "https://github.com.?q=x",
    ];
    for (const url of excluded) link(url);
    const existing = link("https://example.com/already-saved");
    db.prepare("UPDATE links SET screenshot_url=? WHERE id=?").run(
      "https://cdn.example.com/manual.webp",
      existing,
    );
    link("https://127.0.0.1/private");
    link("https://example.com/foreign", "other");
    const id = link("https://example.com/article");
    db.prepare("UPDATE links SET screenshot_url=' ' WHERE id=?").run(id);
    const job = required(await claimScreenshot(identity));
    expect(job).toMatchObject({
      source: "screenshot",
      linkId: id,
      sourceUrl: "https://example.com/article",
      attempts: 1,
    });
    expect(
      rows("screenshot_jobs").filter((row) => excluded.includes(String(row.source_url))),
    ).toEqual([]);
    expect(await claimScreenshot(identity)).toBeNull();
    expect(await renewScreenshot(other, id, job.leaseToken)).toBe(false);
    expect(await renewScreenshot(identity, id, job.leaseToken)).toBe(true);
  });

  it("allows one active job per owner across every source and API key", async () => {
    link();
    link("https://github.com/octocat/Hello-World");
    link("https://example.com/article");
    db.prepare(
      "INSERT INTO api_keys(id,prefix,key_hash,user_id,name,scopes,created_at) VALUES('second','second','second','owner','second','connector:write',0)",
    ).run();
    const claims = await Promise.all([
      claimXBookmark(identity),
      claimGitHubBookmark({ userId: "owner", keyId: "second" }),
      claimScreenshot(identity),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await claimConnectorJob(identity, ["x", "github", "screenshot"])).toBeNull();
    link("https://example.com/foreign", "other");
    expect(await claimScreenshot(other)).toMatchObject({ userId: "other" });
  });

  it("rotates busy sources and respects older clients' capabilities", async () => {
    link();
    link(source);
    link("https://github.com/octocat/Hello-World");
    link("https://example.com/article");
    const sources: string[] = [];
    for (let i = 0; i < 4; i++) {
      vi.mocked(Date.now).mockReturnValue(now + i * 1000);
      const job = required(await claimConnectorJob(identity, ["x", "github", "screenshot"]));
      sources.push(job.source ?? "x");
      if (job.source === "github")
        await failGitHubBookmark(identity, job.linkId, job.leaseToken, "interrupted");
      else if (job.source === "screenshot")
        await failScreenshot(identity, job.linkId, job.leaseToken, "interrupted");
      else await failXBookmark(identity, job.linkId, job.leaseToken, "interrupted");
    }
    expect(sources).toEqual(["github", "x", "screenshot", "x"]);
    link("https://example.com/second");
    expect(await claimConnectorJob(identity, ["x", "github"])).toBeNull();
    expect(await claimConnectorJob(identity, ["screenshot"])).toMatchObject({
      source: "screenshot",
    });
  });

  it("publishes once at the standard R2 key and returns the CDN URL to the owner", async () => {
    const id = link("https://example.com/article");
    const job = required(await claimScreenshot(identity));
    const upload = vi.spyOn(r2, "uploadBufferToR2");
    expect(
      await writeScreenshot(identity, id, job.leaseToken, screenshotDigest, screenshotBody()),
    ).toBe(true);
    expect(
      await writeScreenshot(identity, id, job.leaseToken, screenshotDigest, screenshotBody()),
    ).toBe(true);
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0]?.[2]).toBe("image/webp");
    const hash = await hashUserId("owner", "connector-test-salt");
    const [object] = await r2.listR2Objects();
    expect(object?.key).toMatch(new RegExp(`^${hash}/\\d{8}/[a-f0-9-]{36}\\.webp$`));
    const url = `https://cdn.example.com/${object?.key}`;
    expect(db.prepare("SELECT screenshot_url FROM links WHERE id=?").get(id)?.screenshot_url).toBe(
      url,
    );
    expect((await loadScreenshotPreviews([id])).data).toEqual([
      { id, originalUrl: job.sourceUrl, screenshotUrl: url },
    ]);
    expect(await loadScreenshotPreviews([-1])).toEqual({ success: false });
    expect(await loadScreenshotPreviews([])).toEqual({ success: true, data: [] });
    expect(
      await writeScreenshot(other, id, job.leaseToken, screenshotDigest, screenshotBody()),
    ).toBe(false);
    expect(await claimScreenshot(identity)).toBeNull();
    expect(await drainR2Deletions("owner")).toBe(0);
    await scopedDeleteLink("owner", id);
    await drainR2Deletions("owner");
    expect(await r2.listR2Objects()).toEqual([]);
  });

  it("locks concurrent PUTs and protects the reserved object from orphan cleanup", async () => {
    const id = link("https://example.com/article");
    const job = required(await claimScreenshot(identity));
    const original = r2.uploadBufferToR2;
    const gate = Promise.withResolvers<void>();
    const upload = vi.spyOn(r2, "uploadBufferToR2").mockImplementation(async (...args) => {
      await original(...args);
      await gate.promise;
    });
    const first = writeScreenshot(identity, id, job.leaseToken, screenshotDigest, screenshotBody());
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(
      await writeScreenshot(identity, id, job.leaseToken, screenshotDigest, screenshotBody()),
    ).toBe(false);
    expect(await drainR2Deletions("owner")).toBe(0);
    expect((await scanStorage()).data?.r2.summary.orphanFiles).toBe(0);
    gate.resolve();
    expect(await first).toBe(true);
  });

  it.each(["url", "manual", "delete", "revoke", "expire"])(
    "rejects stale publication after %s during upload",
    async (change) => {
      const id = link("https://example.com/article");
      const job = required(await claimScreenshot(identity));
      const original = r2.uploadBufferToR2;
      vi.spyOn(r2, "uploadBufferToR2").mockImplementationOnce(async (...args) => {
        if (change === "url")
          db.prepare("UPDATE links SET original_url='https://example.com/new' WHERE id=?").run(id);
        if (change === "manual")
          db.prepare(
            "UPDATE links SET screenshot_url='https://cdn.example.com/manual.webp' WHERE id=?",
          ).run(id);
        if (change === "delete") db.prepare("DELETE FROM links WHERE id=?").run(id);
        if (change === "revoke")
          db.prepare("UPDATE api_keys SET revoked_at=1 WHERE id=?").run(identity.keyId);
        if (change === "expire") vi.mocked(Date.now).mockReturnValue(job.leaseUntil + 1);
        // Simulate cleanup winning the race before a late R2 write finishes.
        await drainR2Deletions("owner");
        await original(...args);
      });
      expect(
        await writeScreenshot(identity, id, job.leaseToken, screenshotDigest, screenshotBody()),
      ).toBe(false);
      expect(
        db.prepare("SELECT screenshot_url FROM links WHERE id=?").get(id)?.screenshot_url ?? null,
      ).toBe(change === "manual" ? "https://cdn.example.com/manual.webp" : null);
      vi.mocked(Date.now).mockReturnValue(job.leaseUntil + 1);
      await drainR2Deletions("owner");
      expect(await r2.listR2Objects()).toEqual([]);
    },
  );

  it("retires the old generated preview when its source changes and preserves manual replacements", async () => {
    const id = link("https://example.com/article");
    const job = required(await claimScreenshot(identity));
    await writeScreenshot(identity, id, job.leaseToken, screenshotDigest, screenshotBody());
    const updated = await scopedUpdateLink("owner", id, { originalUrl: "https://example.com/new" });
    expect(updated?.screenshotUrl).toBeNull();
    expect(
      db.prepare("SELECT screenshot_url FROM links WHERE id=?").get(id)?.screenshot_url,
    ).toBeNull();
    await drainR2Deletions("owner");
    expect(await r2.listR2Objects()).toEqual([]);
    const next = required(await claimScreenshot(identity));
    expect(next.sourceUrl).toBe("https://example.com/new");
    await writeScreenshot(identity, id, next.leaseToken, screenshotDigest, screenshotBody());
    db.prepare(
      "UPDATE links SET screenshot_url='https://cdn.example.com/manual.webp' WHERE id=?",
    ).run(id);
    await drainR2Deletions("owner");
    expect(await r2.listR2Objects()).toEqual([]);
    expect(await claimScreenshot(identity)).toBeNull();
  });

  it("retries with backoff and fresh keys, then stops after five failures", async () => {
    const id = link("https://example.com/article");
    const keys = new Set<string>();
    let time = now;
    for (let attempt = 1; attempt <= 5; attempt++) {
      vi.mocked(Date.now).mockReturnValue(time);
      const job = required(await claimScreenshot(identity));
      keys.add(String(rows("screenshot_jobs")[0]?.r2_key));
      expect(job.attempts).toBe(attempt);
      expect(await failScreenshot(identity, id, job.leaseToken, "private upstream error")).toBe(
        true,
      );
      expect(rows("screenshot_jobs")[0]?.error_code).toBe("connector_error");
      expect(await claimScreenshot(identity)).toBeNull();
      time = Number(rows("screenshot_jobs")[0]?.next_attempt_at);
    }
    vi.mocked(Date.now).mockReturnValue(time + 1);
    expect(await claimScreenshot(identity)).toBeNull();
    expect(keys.size).toBe(5);
  });

  it("fences an expired worker from a replacement lease", async () => {
    const id = link("https://example.com/article");
    const first = required(await claimScreenshot(identity));
    const firstKey = rows("screenshot_jobs")[0]?.r2_key;
    vi.mocked(Date.now).mockReturnValue(first.leaseUntil + 1);
    const second = required(await claimScreenshot(identity));
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(rows("screenshot_jobs")[0]?.r2_key).not.toBe(firstKey);
    expect(
      await writeScreenshot(identity, id, first.leaseToken, screenshotDigest, screenshotBody()),
    ).toBe(false);
    expect(
      await writeScreenshot(identity, id, second.leaseToken, screenshotDigest, screenshotBody()),
    ).toBe(true);
  });

  it("checks upload dimensions, digest and HTTP content bounds before publishing", async () => {
    const id = link("https://example.com/article");
    const job = required(await claimScreenshot(identity));
    await expect(
      writeScreenshot(identity, id, job.leaseToken, "invalid", screenshotBody()),
    ).rejects.toThrow("invalid_screenshot");
    await expect(
      writeScreenshot(
        identity,
        id,
        job.leaseToken,
        screenshotDigest,
        screenshotBody(Buffer.alloc(512 * 1024 + 1)),
      ),
    ).rejects.toThrow("screenshot_too_large");
    await expect(
      writeScreenshot(identity, id, job.leaseToken, "0".repeat(64), screenshotBody()),
    ).rejects.toThrow("digest_mismatch");
    await expect(
      writeScreenshot(
        identity,
        id,
        job.leaseToken,
        screenshotDigest,
        screenshotBody(Buffer.from("not a screenshot")),
      ),
    ).rejects.toThrow("invalid_screenshot");
    expect(await r2.listR2Objects()).toEqual([]);
    const context = { params: Promise.resolve({ id: String(id) }) };
    const headers = {
      authorization: "Bearer zhe_test_cli-key",
      "x-connector-lease": job.leaseToken,
      "x-content-sha256": screenshotDigest,
    };
    expect(
      (
        await uploadScreenshot(
          new NextRequest("https://zhe.to/api/v1/connector/screenshot/jobs/1", {
            method: "PUT",
            headers: { ...headers, "content-type": "image/png" },
            body: screenshot,
          }),
          context,
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await uploadScreenshot(
          new NextRequest("https://zhe.to/api/v1/connector/screenshot/jobs/1", {
            method: "PUT",
            headers: { ...headers, "content-type": "image/webp", "content-length": "524289" },
            body: screenshot,
          }),
          context,
        )
      ).status,
    ).toBe(413);
    const action = (action: string) =>
      new NextRequest("https://zhe.to/api/v1/connector/screenshot/jobs/1", {
        method: "POST",
        headers,
        body: JSON.stringify({ action }),
      });
    expect((await updateScreenshotJob(action("complete"), context)).status).toBe(400);
    expect((await updateScreenshotJob(action("renew"), context)).status).toBe(200);
    const put = () =>
      new NextRequest("https://zhe.to/api/v1/connector/screenshot/jobs/1", {
        method: "PUT",
        headers: { ...headers, "content-type": "image/webp" },
        body: screenshot,
      });
    expect((await uploadScreenshot(put(), context)).status).toBe(200);
    expect((await uploadScreenshot(put(), context)).status).toBe(200);
    expect((await updateScreenshotJob(action("renew"), context)).status).toBe(409);
  });
});

describe("deleting screenshot previews", () => {
  it("deletes the file and job, permits recapture and preserves a replacement on repeated requests", async () => {
    const id = link("https://example.com/article");
    const scoped = new ScopedDB("owner");
    const first = required(await claimScreenshot(identity));
    await writeScreenshot(identity, id, first.leaseToken, screenshotDigest, screenshotBody());
    const oldUrl = required((await scoped.getLinkById(id))?.screenshotUrl);

    expect((await scoped.deleteLinkScreenshot(id, oldUrl))?.screenshotUrl).toBeNull();
    expect(await r2.listR2Objects()).toEqual([]);
    expect(rows("screenshot_jobs")).toEqual([]);
    expect((await scoped.deleteLinkScreenshot(id, oldUrl))?.screenshotUrl).toBeNull();
    expect(
      await writeScreenshot(identity, id, first.leaseToken, screenshotDigest, screenshotBody()),
    ).toBe(false);

    const second = required(await claimScreenshot(identity));
    expect(second.linkId).toBe(id);
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(await claimScreenshot(identity)).toBeNull();
    await writeScreenshot(identity, id, second.leaseToken, screenshotDigest, screenshotBody());
    const newUrl = required((await scoped.getLinkById(id))?.screenshotUrl);
    expect(newUrl).not.toBe(oldUrl);
    expect((await scoped.deleteLinkScreenshot(id, oldUrl))?.screenshotUrl).toBe(newUrl);
    expect(await r2.listR2Objects()).toHaveLength(1);
    expect(rows("screenshot_jobs")[0]?.state).toBe("complete");
  });

  it("also deletes legacy provider files and retains cleanup when R2 is unavailable", async () => {
    const id = link("https://example.com/article");
    const key = `${await hashUserId("owner", "connector-test-salt")}/20260917/legacy.png`;
    const url = `https://cdn.example.com/${key}`;
    await r2.uploadBufferToR2(key, screenshot, "image/png");
    db.prepare("UPDATE links SET screenshot_url=? WHERE id=?").run(url, id);
    const remove = vi
      .spyOn(r2, "deleteR2Object")
      .mockRejectedValueOnce(new Error("R2 unavailable"));

    expect((await new ScopedDB("owner").deleteLinkScreenshot(id, url))?.screenshotUrl).toBeNull();
    expect(remove).toHaveBeenCalledWith(key);
    expect(rows("r2_deletions")[0]?.key).toBe(key);
    expect(await r2.listR2Objects()).toHaveLength(1);
    await drainR2Deletions("owner");
    expect(await r2.listR2Objects()).toEqual([]);
    expect(rows("r2_deletions")).toEqual([]);
    expect(required(await claimScreenshot(identity)).linkId).toBe(id);
  });

  it("enforces link ownership and keeps an object until its last link reference is cleared", async () => {
    const first = link("https://example.com/first");
    const second = link("https://example.com/second");
    const key = `${await hashUserId("owner", "connector-test-salt")}/20260917/shared.png`;
    const url = `https://cdn.example.com/${key}`;
    await r2.uploadBufferToR2(key, screenshot, "image/png");
    db.prepare("UPDATE links SET screenshot_url=?").run(url);
    expect(await new ScopedDB("other").deleteLinkScreenshot(first, url)).toBeNull();
    const scoped = new ScopedDB("owner");
    expect((await scoped.getLinkById(first))?.screenshotUrl).toBe(url);
    await scoped.deleteLinkScreenshot(first, url);
    expect(await r2.listR2Objects()).toHaveLength(1);
    await scoped.deleteLinkScreenshot(second, url);
    expect(await r2.listR2Objects()).toEqual([]);
  });

  it("clears external, shared and foreign previews without deleting unrelated R2 objects", async () => {
    const owned = await hashUserId("owner", "connector-test-salt");
    const foreign = `${await hashUserId("other", "connector-test-salt")}/20260917/image.png`;
    await r2.uploadBufferToR2(foreign, screenshot, "image/png");
    const remove = vi.spyOn(r2, "deleteR2Object");
    for (const url of [
      `https://cdn.example.com/${foreign}`,
      `https://cdn.example.com/${owned}/../${foreign}`,
      "https://external.example.com/image.png",
      "/github-preview.jpg",
    ]) {
      const id = link("https://example.com/article");
      db.prepare("UPDATE links SET screenshot_url=? WHERE id=?").run(url, id);
      expect((await new ScopedDB("owner").deleteLinkScreenshot(id, url))?.screenshotUrl).toBeNull();
    }
    expect(remove).not.toHaveBeenCalled();
    expect(await r2.listR2Objects()).toHaveLength(1);
  });

  it("keeps the preview when durable cleanup cannot be recorded", async () => {
    const id = link("https://example.com/article");
    const url = `https://cdn.example.com/${await hashUserId("owner", "connector-test-salt")}/20260917/legacy.png`;
    db.prepare("UPDATE links SET screenshot_url=? WHERE id=?").run(url, id);
    const query = d1.executeD1Query;
    vi.spyOn(d1, "executeD1Query").mockImplementation(async (sql, params) => {
      if (sql.includes("INSERT INTO r2_deletions")) throw new Error("D1 unavailable");
      return query(sql, params);
    });
    await expect(new ScopedDB("owner").deleteLinkScreenshot(id, url)).rejects.toThrow(
      "D1 unavailable",
    );
    expect(db.prepare("SELECT screenshot_url FROM links WHERE id=?").get(id)?.screenshot_url).toBe(
      url,
    );
    vi.stubEnv("R2_USER_HASH_SALT", "");
    await expect(new ScopedDB("owner").deleteLinkScreenshot(id, url)).rejects.toThrow(
      "not configured",
    );
  });

  it("does not clear a concurrent replacement between reading and deleting the preview", async () => {
    const id = link("https://example.com/article");
    const url = `https://cdn.example.com/${await hashUserId("owner", "connector-test-salt")}/20260917/legacy.png`;
    db.prepare("UPDATE links SET screenshot_url=? WHERE id=?").run(url, id);
    const query = d1.executeD1Query;
    vi.spyOn(d1, "executeD1Query").mockImplementation(async (sql, params) => {
      if (sql.includes("INSERT INTO r2_deletions"))
        db.prepare("UPDATE links SET screenshot_url='https://example.com/new.png' WHERE id=?").run(
          id,
        );
      return query(sql, params);
    });
    expect((await new ScopedDB("owner").deleteLinkScreenshot(id, url))?.screenshotUrl).toBe(
      "https://example.com/new.png",
    );
  });
});

describe("GitHub Connector snapshots", () => {
  it("retains analysis when only repository statistics change and invalidates it for a new README", async () => {
    const url = "https://github.com/octocat/Hello-World";
    const id = link(url);
    const job = required(await claimGitHubBookmark(identity));
    await completeGitHubBookmark(identity, id, job.leaseToken, repository);
    const analysis = {
      summary: "已保存的总结",
      features: [],
      useCases: [],
      techStack: [],
      tags: [],
      model: "test",
      provider: "custom",
      generatedAt: now,
    };
    db.prepare(
      "UPDATE github_bookmarks SET result_json=json_set(result_json,'$.analysis',json(?)) WHERE link_id=?",
    ).run(JSON.stringify(analysis), id);
    db.prepare("UPDATE links SET title='用户标题',note='用户备注' WHERE id=?").run(id);
    await retryGitHubBookmarkAction(id);
    const refresh = required(await claimGitHubBookmark(identity));
    await completeGitHubBookmark(identity, id, refresh.leaseToken, {
      ...repository,
      stars: 456,
      analysis: { summary: "untrusted connector output" },
    });
    expect((await getGitHubBookmarks("owner", [id]))[0]).toMatchObject({
      analysis,
      repository: { stars: 456 },
    });
    await retryGitHubBookmarkAction(id);
    const changed = required(await claimGitHubBookmark(identity));
    await completeGitHubBookmark(identity, id, changed.leaseToken, {
      ...repository,
      readme: "# New source",
      analysis,
    });
    expect((await getGitHubBookmarks("owner", [id]))[0]?.analysis).toBeNull();
    expect((await loadGitHubReadme(id)).data?.readme).toBe("# New source");
    expect(await new ScopedDB("owner").getLinkById(id)).toMatchObject({
      title: "用户标题",
      note: "用户备注",
    });
  });

  it("negotiates GitHub jobs without sending them to old X-only clients", async () => {
    const id = link("https://github.com/octocat/Hello-World/issues/1");
    const headers = { authorization: "Bearer zhe_test_cli-key" };
    const legacy = await poll(
      new NextRequest("https://zhe.to/api/v1/connector", { method: "POST", headers }),
    );
    expect((await legacy.json()).job).toBeNull();
    const response = await poll(
      new NextRequest("https://zhe.to/api/v1/connector", {
        method: "POST",
        headers: { ...headers, "x-connector-sources": "github,x" },
      }),
    );
    const { job } = await response.json();
    expect(job).toMatchObject({ source: "github", linkId: id, fullName: repository.fullName });
    const complete = await updateGitHubJob(
      new NextRequest(`https://zhe.to/api/v1/connector/github/jobs/${id}`, {
        method: "POST",
        headers: { ...headers, "x-connector-lease": job.leaseToken },
        body: JSON.stringify({ action: "complete", repository }),
      }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(complete.status).toBe(200);
    const summaries = await getGitHubBookmarks("owner", [id]);
    expect(summaries[0]).toMatchObject({
      state: "complete",
      hasReadme: true,
      repository: { stars: 123, commits: 84 },
      capturedAt: now,
    });
    expect(summaries[0]?.repository).not.toHaveProperty("readme");
    expect(JSON.stringify(summaries)).not.toContain(job.leaseToken);
    expect((await loadGitHubReadme(id)).data?.readme).toBe(repository.readme);
    expect(rows("links")[0]?.meta_title).toBe(repository.fullName);
    expect((await loadConnectorSummary()).states).toEqual([{ state: "complete", count: 1 }]);
  });

  it("bounds malformed URL discovery, isolates users and claims leases once", async () => {
    link("https://github.com/topics/typescript");
    const id = link("HTTP://WWW.GITHUB.COM/octocat/Hello-World.git");
    link("https://github.com/other/private", "other");
    const job = required(await claimGitHubBookmark(identity));
    expect(job.linkId).toBe(id);
    expect(rows("github_bookmarks")[0]?.state).toBe("unavailable");
    expect(await claimGitHubBookmark(identity)).toBeNull();
    expect(await renewGitHubBookmark(other, id, job.leaseToken)).toBe(false);
    expect(await renewGitHubBookmark(identity, id, "wrong-token")).toBe(false);
    expect(await completeGitHubBookmark(other, id, job.leaseToken, repository)).toBe(false);
    expect(await getGitHubBookmarks("other", [id])).toEqual([]);
    expect(await getGitHubBookmarks("owner", [])).toEqual([]);
    expect(await renewGitHubBookmark(identity, id, job.leaseToken)).toBe(true);
    expect((await retryGitHubBookmarkAction(id)).success).toBe(false);
  });

  it.each(["expired", "revoked", "scope"])(
    "rechecks key %s at the snapshot mutation",
    async (failure) => {
      const id = link("https://github.com/octocat/Hello-World");
      const job = required(await claimGitHubBookmark(identity));
      if (failure === "expired")
        db.prepare("UPDATE api_keys SET expires_at=? WHERE id=?").run(
          Math.floor(now / 1000),
          identity.keyId,
        );
      if (failure === "revoked")
        db.prepare("UPDATE api_keys SET revoked_at=? WHERE id=?").run(now, identity.keyId);
      if (failure === "scope")
        db.prepare("UPDATE api_keys SET scopes='links:read' WHERE id=?").run(identity.keyId);
      expect(await completeGitHubBookmark(identity, id, job.leaseToken, repository)).toBe(false);
      expect(await failGitHubBookmark(identity, id, job.leaseToken, "interrupted")).toBe(false);
      expect(await renewGitHubBookmark(identity, id, job.leaseToken)).toBe(false);
      expect(rows("links")[0]?.meta_title).toBeNull();
    },
  );

  it("rejects mismatched or excessive captures, retains a good snapshot on failure, and retries", async () => {
    const id = link("https://github.com/octocat/Hello-World");
    const job = required(await claimGitHubBookmark(identity));
    await expect(
      completeGitHubBookmark(identity, id, job.leaseToken, {
        ...repository,
        sourceFullName: "other/repo",
      }),
    ).rejects.toThrow("invalid_github_capture");
    await expect(
      completeGitHubBookmark(identity, id, job.leaseToken, {
        ...repository,
        readme: "\n".repeat(950_000),
      }),
    ).rejects.toThrow("github_content_too_large");
    expect(await completeGitHubBookmark(identity, id, job.leaseToken, repository)).toBe(true);
    expect(await retryGitHubBookmarkAction(id)).toEqual({ success: true });
    const retry = required(await claimGitHubBookmark(identity));
    expect(
      await failGitHubBookmark(identity, id, retry.leaseToken, "private upstream token detail"),
    ).toBe(true);
    expect((await loadGitHubBookmarks([id])).data?.[0]).toMatchObject({
      state: "failed",
      errorCode: "connector_error",
    });
    expect((await loadGitHubReadme(id)).data?.readme).toBe(repository.readme);
    expect(await claimGitHubBookmark(identity)).toBeNull();
  });

  it("invalidates old captures on URL changes, expiration and deletion", async () => {
    const id = link("https://github.com/octocat/Hello-World");
    const job = required(await claimGitHubBookmark(identity));
    expect(await renewGitHubBookmark(identity, id, job.leaseToken, now + 180_000)).toBe(false);
    db.prepare("UPDATE links SET original_url='https://example.com' WHERE id=?").run(id);
    expect(await completeGitHubBookmark(identity, id, job.leaseToken, repository)).toBe(false);
    expect(await loadGitHubReadme(id)).toEqual({ success: true, data: null });
    expect(await retryGitHubBookmarkAction(id)).toEqual({ success: false });
    db.prepare(
      "UPDATE links SET original_url='https://github.com/octocat/Hello-World' WHERE id=?",
    ).run(id);
    expect(await retryGitHubBookmarkAction(id)).toEqual({ success: true });
    const next = required(await claimGitHubBookmark(identity));
    db.prepare("DELETE FROM links WHERE id=?").run(id);
    expect(await completeGitHubBookmark(identity, id, next.leaseToken, repository)).toBe(false);
    expect(rows("github_bookmarks")).toEqual([]);
  });

  it("retires exhausted interrupted work and allows explicit recovery", async () => {
    const id = link("https://github.com/octocat/Hello-World");
    await claimGitHubBookmark(identity);
    db.prepare("UPDATE github_bookmarks SET attempts=5,lease_until=0 WHERE link_id=?").run(id);
    expect(await claimGitHubBookmark(identity)).toBeNull();
    expect(rows("github_bookmarks")[0]).toMatchObject({
      state: "failed",
      error_code: "interrupted",
    });
    await retryGitHubBookmarkAction(id);
    const job = required(await claimGitHubBookmark(identity));
    expect(await failGitHubBookmark(identity, id, job.leaseToken, "github_rate_limited")).toBe(
      true,
    );
    expect(rows("github_bookmarks")[0]?.error_code).toBe("github_rate_limited");
  });

  it("validates browser actions and does not return another user's README", async () => {
    const id = link("https://github.com/octocat/Hello-World", "other");
    const job = required(await claimGitHubBookmark(other));
    await completeGitHubBookmark(other, id, job.leaseToken, repository);
    expect(await loadGitHubReadme(id)).toEqual({ success: true, data: null });
    expect(await retryGitHubBookmarkAction(id)).toEqual({ success: false });
    expect(await loadGitHubBookmarks([-1])).toEqual({ success: false });
    expect(await loadGitHubBookmarks(Array(81).fill(1))).toEqual({ success: false });
    expect(await loadGitHubReadme(NaN)).toEqual({ success: false });
    expect(await retryGitHubBookmarkAction(-1)).toEqual({ success: false });
    vi.spyOn(authContext, "requireAuth").mockResolvedValue(null);
    expect(await loadGitHubBookmarks([id])).toEqual({ success: false });
    expect(await loadGitHubReadme(id)).toEqual({ success: false });
    expect(await retryGitHubBookmarkAction(id)).toEqual({ success: false });
  });
});

describe("Connector HTTP boundary uses the same CLI authentication", () => {
  it("returns retryable failures from dashboard actions when D1 is unavailable", async () => {
    vi.spyOn(d1, "executeD1Query").mockRejectedValue(new Error("D1 unavailable"));
    for (const action of [
      () => loadXBookmarks([1]),
      () => loadScreenshotPreviews([1]),
      () => loadGitHubBookmarks([1]),
      () => loadGitHubReadme(1),
      () => retryXBookmarkAction(1),
      () => retryGitHubBookmarkAction(1),
      () => updateXMediaDimensionsAction(1, [{ id: "1", width: 1600, height: 1200 }]),
    ]) {
      await expect(action()).resolves.toEqual({ success: false });
    }
  });

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
  it("keeps an existing key without an explicit expiry valid after 30 days", async () => {
    db.prepare("UPDATE api_keys SET created_at=0 WHERE id=?").run(identity.keyId);
    const response = await status(request());
    expect(response.status).toBe(200);
    expect((await response.json()).expiresAt).toBeNull();
    expect((await loadConnectorSummary()).lastSeenAt).toBe(now);
    expect(await connectorKeyActive(identity, now + 31 * 86400_000)).toBe(true);
  });
  it("requires authentication, scope and unexpired capability", async () => {
    expect((await status(new NextRequest("https://zhe.to/api/v1/connector"))).status).toBe(401);
    expect((await status(request())).status).toBe(200);
    db.prepare("UPDATE api_keys SET scopes='links:read' WHERE id=?").run(identity.keyId);
    expect((await status(request())).status).toBe(403);
    db.prepare("UPDATE api_keys SET scopes='connector:write',expires_at=0 WHERE id=?").run(
      identity.keyId,
    );
    expect((await status(request())).status).toBe(401);
    expect((await loadConnectorSummary()).lastSeenAt).toBeNull();
  });
  it("reports the selected expiry in milliseconds and rejects it at the exact second", async () => {
    const expiresAt = (Math.floor(now / 1000) + 60) * 1000;
    db.prepare("UPDATE api_keys SET expires_at=? WHERE id=?").run(expiresAt / 1000, identity.keyId);
    expect((await (await status(request())).json()).expiresAt).toBe(expiresAt);
    expect(await connectorKeyActive(identity, expiresAt - 1)).toBe(true);
    expect(await connectorKeyActive(identity, expiresAt)).toBe(false);
    vi.spyOn(Date, "now").mockReturnValue(expiresAt);
    expect((await status(request())).status).toBe(401);
    expect((await loadConnectorSummary()).lastSeenAt).toBeNull();
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
  it("uses an existing scoped API key with its owner and no implicit lifetime", async () => {
    expect(await connectorKeyActive(identity, now)).toBe(true);
    expect(await connectorKeyActive({ ...identity, userId: "other" }, now)).toBe(false);
    expect(await connectorKeyActive(identity, now + 365 * 86400_000)).toBe(true);
    db.prepare("UPDATE api_keys SET scopes='links:read' WHERE id=?").run(identity.keyId);
    expect(await connectorKeyActive(identity, now)).toBe(false);
  });
  it.each(["revoked_at", "expires_at"])("honors %s at every task mutation", async (column) => {
    link();
    const job = required(await claimXBookmark(identity, now));
    db.prepare(`UPDATE api_keys SET ${column}=? WHERE id=?`).run(
      Math.floor(now / 1000),
      identity.keyId,
    );
    expect(await connectorKeyActive(identity, now)).toBe(false);
    expect(await renewXBookmark(identity, job.linkId, job.leaseToken, now)).toBe(false);
    expect(await stageXCapture(identity, job.linkId, job.leaseToken, capture, now)).toBe(false);
    expect(await completeXBookmark(identity, job.linkId, job.leaseToken, now)).toBe(false);
    expect(await failXBookmark(identity, job.linkId, job.leaseToken, "interrupted", now)).toBe(
      false,
    );
    expect(await claimXBookmark(identity, now)).toBeNull();
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
    width: 1280,
    height: 720,
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
  it.each(["lease", "key"])(
    "removes a completed upload if its %s expires during streaming",
    async (expiry) => {
      const { id, job, asset } = await prepare();
      const later = expiry === "lease" ? now + 180_001 : now + 2_000;
      if (expiry === "key")
        db.prepare("UPDATE api_keys SET expires_at=? WHERE id=?").run(
          Math.floor(later / 1000),
          identity.keyId,
        );
      const original = r2.uploadStreamToR2;
      vi.spyOn(r2, "uploadStreamToR2").mockImplementation(async (...args) => {
        await original(...args);
        vi.spyOn(Date, "now").mockReturnValue(later);
      });
      expect(await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now)).toBe(false);
      expect(rows("x_media")).toHaveLength(0);
      expect(await drainR2Deletions("owner", later)).toBe(1);
      expect(await r2.listR2Objects()).toHaveLength(0);
    },
  );
  it.each(["lease", "key"])(
    "does not publish when the %s expires while reading prerequisites",
    async (expiry) => {
      const { id, job, asset } = await prepare();
      await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now);
      const later = expiry === "lease" ? now + 180_001 : now + 2_000;
      if (expiry === "key")
        db.prepare("UPDATE api_keys SET expires_at=? WHERE id=?").run(
          Math.floor(later / 1000),
          identity.keyId,
        );
      const original = d1.executeD1Query;
      vi.spyOn(d1, "executeD1Query").mockImplementation(async (sql, params) => {
        const result = await original(sql, params);
        if (sql.includes("SELECT media_id,kind")) vi.spyOn(Date, "now").mockReturnValue(later);
        return result;
      });
      expect(await completeXBookmark(identity, id, job.leaseToken, now)).toBe(false);
      expect(rows("uploads")).toHaveLength(0);
      expect((await getXBookmarks("owner", [id]))[0]?.tweet).toBeNull();
    },
  );
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
  it("publishes precise size failures without exposing upstream media URLs", async () => {
    const { id, job } = await prepare();
    const failed = structuredClone(videoCapture) as XCapture;
    required(failed.tweet.media[0]).archiveError = "media_too_large";
    required(failed.tweet.media[0]).videoAttempts = [
      { width: 3840, height: 2160, size: 564200241 },
      { width: 1920, height: 1080, size: 120845059 },
      { width: 1280, height: 720, size: 100000001 },
    ];
    await stageXCapture(identity, id, job.leaseToken, failed, now);
    await completeXBookmark(identity, id, job.leaseToken, now);
    const [result] = await getXBookmarks("owner", [id]);
    expect(result).toMatchObject({
      state: "partial",
      errorCode: "media_too_large",
      tweet: { media: [] },
      mediaErrors: [
        {
          mediaId,
          type: "VIDEO",
          code: "media_too_large",
          attempts: required(failed.tweet.media[0]).videoAttempts,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("video.twimg.com");
  });
  it("keeps resolution and size tied to the archived bytes on retry", async () => {
    const { id, job, asset } = await prepare();
    await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now);
    const replacement = { ...descriptor, size: 99_000_000, width: 3840, height: 2160 };
    expect(await reserveXMedia(identity, id, job.leaseToken, replacement, now)).toMatchObject({
      id: asset.id,
      uploaded: true,
    });
    const changed = structuredClone(videoCapture) as XCapture;
    required(changed.tweet.media[0]).width = 9;
    required(changed.tweet.media[0]).height = 16;
    required(changed.tweet.media[0]).size = 1;
    required(changed.tweet.media[0]).resolution = "4K";
    await stageXCapture(identity, id, job.leaseToken, changed, now);
    await completeXBookmark(identity, id, job.leaseToken, now);
    expect((await getXBookmarks("owner", [id]))[0]?.tweet?.media[0]).toMatchObject({
      resolution: "720p",
      size: 64,
      width: 9,
      height: 16,
    });
  });
  it("accepts exactly 100 MB and rejects invalid resolution metadata", async () => {
    const { id, job } = await prepare();
    await expect(
      reserveXMedia(identity, id, job.leaseToken, { ...descriptor, size: 100_000_000 }, now),
    ).resolves.toBeTruthy();
    await expect(
      reserveXMedia(identity, id, job.leaseToken, { ...descriptor, width: -1 }, now),
    ).rejects.toThrow("invalid_media");
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
      reserveXMedia(identity, id, job.leaseToken, { ...descriptor, size: 100_000_001 }, now),
    ).rejects.toThrow("media_too_large");
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

  it.each(["video", "poster"])(
    "honors a deletion racing a retry's %s reservation",
    async (kind) => {
      const { id, job, asset } = await prepare();
      await writeXMedia(identity, id, job.leaseToken, asset.id, stream(), now);
      const partialCapture = {
        tweet: {
          ...videoCapture.tweet,
          media: [
            ...videoCapture.tweet.media,
            {
              id: "2000000000000000003",
              type: "PHOTO",
              url: "https://pbs.twimg.com/media/test.jpg",
            },
          ],
        },
      };
      await stageXCapture(identity, id, job.leaseToken, partialCapture, now);
      await completeXBookmark(identity, id, job.leaseToken, now);
      expect((await getXBookmarks("owner", [id]))[0]?.state).toBe("partial");
      const retryAt = now + 300_001;
      vi.spyOn(Date, "now").mockReturnValue(retryAt);
      const retry = required(await claimXBookmark(identity, retryAt));
      await stageXCapture(identity, id, retry.leaseToken, partialCapture, retryAt);
      const original = d1.executeD1Query;
      let deleted = false;
      vi.spyOn(d1, "executeD1Query").mockImplementation(async (sql, params) => {
        const result = await original(sql, params);
        if (!deleted && sql.startsWith("SELECT post_id,draft_json,removed_media")) {
          deleted = true;
          db.prepare("DELETE FROM uploads WHERE key=?").run(asset.key);
        }
        return result;
      });
      const reservation = await reserveXMedia(
        identity,
        id,
        retry.leaseToken,
        { ...descriptor, kind, mime: kind === "video" ? "video/mp4" : "image/jpeg" },
        retryAt,
      );
      expect(reservation).toEqual({ skipped: true });
      expect(rows("x_media")).toEqual([]);
      expect(rows("uploads")).toEqual([]);
    },
  );

  it("cleans unreferenced objects even when 100 older queue entries still have screenshot references", async () => {
    for (let i = 0; i < 100; i++) {
      const key = `owner/referenced-${i}.jpg`;
      const id = link(`https://example.com/${i}`);
      db.prepare("UPDATE links SET screenshot_url=? WHERE id=?").run(
        `https://cdn.example.com/${key}`,
        id,
      );
      await enqueueR2Deletion(key, "owner", now - 1);
    }
    const orphan = "owner/retired.jpg";
    await r2.uploadBufferToR2(orphan, bytes, "image/jpeg");
    await enqueueR2Deletion(orphan, "owner", now);

    expect(await drainR2Deletions("owner", now)).toBe(1);
    expect(rows("r2_deletions")).toHaveLength(100);
    expect(await r2.listR2Objects()).toEqual([]);
  });

  it("retains cleanup re-enqueued while an earlier R2 deletion is in flight", async () => {
    const key = "owner/late-upload.mp4";
    await r2.uploadBufferToR2(key, bytes, "video/mp4");
    await enqueueR2Deletion(key, "owner", now);
    const original = r2.deleteR2Object;
    vi.spyOn(r2, "deleteR2Object").mockImplementationOnce(async (target) => {
      await original(target);
      // The canceled upload finishes after R2 deletes, before DELETE responds.
      await r2.uploadBufferToR2(target, bytes, "video/mp4");
      await enqueueR2Deletion(target, "owner", now);
    });

    await drainR2Deletions("owner", now);
    expect(rows("r2_deletions")).toHaveLength(1);
    expect(await r2.listR2Objects()).toHaveLength(1);
    expect(await drainR2Deletions("owner", now)).toBe(1);
    expect(rows("r2_deletions")).toEqual([]);
    expect(await r2.listR2Objects()).toEqual([]);
  });
});

describe("discover saved bookmarks, then enrich", () => {
  function savedMediaLink(owner = "owner") {
    const id = link(source, owner);
    const media = [
      { id: "123", type: "PHOTO" as const, url: "https://pbs.twimg.com/media/test.jpg" },
      { id: "456", type: "PHOTO" as const, url: "https://pbs.twimg.com/media/next.jpg" },
    ];
    const archived = { ...capture, tweet: { ...capture.tweet, media }, media };
    db.prepare(
      "INSERT INTO x_bookmarks(link_id,user_id,source_url,post_id,state,result_json,updated_at) VALUES(?,?,?,?,'complete',?,?)",
    ).run(id, owner, source, postId, JSON.stringify(archived), now);
    return { id, archived };
  }

  it("persists owner-corrected media proportions without changing content or stored files", async () => {
    const { id, archived } = savedMediaLink();
    const result = await updateXMediaDimensionsAction(id, [{ id: "123", width: 9, height: 16 }]);
    expect(result).toEqual({ success: true, updatedAt: now + 1 });
    const saved = JSON.parse(String(rows("x_bookmarks")[0]?.result_json)) as XCapture;
    expect(saved.tweet).toEqual({
      ...archived.tweet,
      media: [{ ...archived.media[0], width: 9, height: 16 }, archived.media[1]],
    });
    expect(saved.media).toEqual(saved.tweet.media);
    expect(rows("x_media")).toEqual([]);
    expect(rows("uploads")).toEqual([]);
  });

  it("rejects unknown attachments, other owners and live Connector leases", async () => {
    const { id } = savedMediaLink();
    const otherLink = savedMediaLink("other").id;
    const before = rows("x_bookmarks");
    const dimensions = [{ id: "123", width: 9, height: 16 }];
    expect((await updateXMediaDimensionsAction(otherLink, dimensions)).success).toBe(false);
    expect(
      (await updateXMediaDimensionsAction(id, [...dimensions, { id: "999", width: 1, height: 1 }]))
        .success,
    ).toBe(false);
    expect(rows("x_bookmarks")).toEqual(before);
    vi.spyOn(authContext, "requireAuth").mockResolvedValueOnce(null);
    expect((await updateXMediaDimensionsAction(id, dimensions)).success).toBe(false);
    db.prepare("UPDATE x_bookmarks SET state='running',lease_until=? WHERE link_id=?").run(
      now + 60_000,
      id,
    );
    expect((await updateXMediaDimensionsAction(id, dimensions)).success).toBe(false);
  });

  it.each([
    { width: 0, height: 16 },
    { width: 9, height: -1 },
    { width: 9.5, height: 16 },
    { width: 9, height: 65536 },
    { width: Number.NaN, height: 16 },
  ])("rejects invalid manual dimensions %j", async (dimensions) => {
    const { id } = savedMediaLink();
    const before = rows("x_bookmarks");
    expect((await updateXMediaDimensionsAction(id, [{ id: "123", ...dimensions }])).success).toBe(
      false,
    );
    expect(rows("x_bookmarks")).toEqual(before);
  });

  it("does not overwrite a capture updated while a manual correction is being saved", async () => {
    const { id } = savedMediaLink();
    const query = d1.executeD1Query;
    vi.spyOn(d1, "executeD1Query").mockImplementationOnce(async (sql, params) => {
      const selected = await query(sql, params);
      db.prepare(
        "UPDATE x_bookmarks SET result_json=json_set(result_json,'$.tweet.text',?) WHERE link_id=?",
      ).run("A newer capture", id);
      return selected;
    });
    expect(
      (await updateXMediaDimensionsAction(id, [{ id: "123", width: 9, height: 16 }])).success,
    ).toBe(false);
    const saved = JSON.parse(String(rows("x_bookmarks")[0]?.result_json)) as XCapture;
    expect(saved.tweet.text).toBe("A newer capture");
    expect(saved.tweet.media[0]?.width).toBeUndefined();
  });

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
    const claims = await Promise.all(ids.map(() => claimXBookmark(identity, now)));
    const jobs = claims.filter((job) => job !== null);
    expect(jobs).toHaveLength(1);
    for (const id of ids) {
      const job = required(jobs.at(-1));
      expect(job).toMatchObject({ linkId: id, postId, userId: "owner" });
      await failXBookmark(identity, id, job.leaseToken, "interrupted", now);
      if (id !== ids.at(-1)) jobs.push(required(await claimXBookmark(identity, now)));
    }
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
