import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "@auth/core/jwt";
import type { APIRequestContext } from "@playwright/test";
import { normalizeXPost } from "../../cli/src/connector/core";
import { expect, test } from "./fixtures";
import { appTitle, islandHeading } from "./helpers/chrome";
import { executeD1, queryD1 } from "./helpers/d1";

test.describe.configure({ mode: "serial" });

for (const viewport of [
  { width: 1365, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`saved X bookmarks enrich, play and delete at ${viewport.width}px`, async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    // A signed LOCAL test session keeps this user's uploads isolated from
    // other concurrent specs. Never mint sessions against a remote host.
    assert(baseURL === "http://localhost:27006");
    assert(process.env.D1_PROXY_URL?.startsWith("http://127.0.0.1:"));
    const secret = process.env.AUTH_SECRET;
    assert(secret);
    const owner = `connector-browser-${randomUUID()}`;
    const key = `zhe_${randomUUID().replaceAll("-", "")}`;
    const keyId = randomUUID();
    const dir = await mkdtemp(join(tmpdir(), "zhe-browser-media-"));
    await executeD1("INSERT INTO users(id,name,email) VALUES(?,?,?)", [
      owner,
      "Connector Test",
      `${owner}@test.local`,
    ]);
    await executeD1(
      "INSERT INTO api_keys(id,prefix,key_hash,user_id,name,scopes,created_at) VALUES(?,?,?,?,?,?,?)",
      [
        keyId,
        key.slice(0, 12),
        createHash("sha256").update(key).digest("hex"),
        owner,
        "Synthetic browser CLI",
        "links:read,links:write,uploads:read,uploads:write,connector:write",
        Math.floor(Date.now() / 1000),
      ],
    );
    const session = await encode({
      token: { sub: owner, name: "Connector Test", email: `${owner}@test.local` },
      secret,
      salt: "authjs.session-token",
    });
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: session,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
    let linkId: number | undefined;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.setViewportSize(viewport);
      await page.goto("/dashboard");
      await expect(islandHeading(page, "全部链接")).toBeVisible();
      await expect(appTitle(page, "链接管理")).toBeVisible();
      await expect(page.getByRole("link", { name: "GitHub", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "切换主题" })).toBeVisible();
      const postId = "2000000000000000001";
      const mediaId = "2000000000000000002";
      const photoId = "2000000000000000003";
      await page
        .locator("main")
        .getByRole("button", { name: "新建链接", exact: true })
        .first()
        .click();
      await page.locator("#url").fill(`https://x.com/example/status/${postId}`);
      await page.getByRole("button", { name: "创建链接", exact: true }).click();
      await expect(page.getByText("创建短链接", { exact: true })).toBeHidden({ timeout: 25_000 });
      const card = page.getByTestId("link-card");
      await expect(card.getByText("等待补全")).toBeVisible();

      const claim = await page.request.post("/api/v1/connector", { headers, data: {} });
      expect(claim.status()).toBe(200);
      const { job } = await claim.json();
      expect(job.postId).toBe(postId);
      linkId = job.linkId;
      const leased = { ...headers, "x-connector-lease": job.leaseToken };
      const endpoint = `/api/v1/connector/jobs/${linkId}`;
      const raw = {
        rest_id: postId,
        legacy: {
          full_text: "Professional X bookmark preview. ".repeat(28),
          created_at: "2026-09-12T00:00:00Z",
          favorite_count: 7,
        },
        core: {
          user_results: {
            result: { rest_id: "1", legacy: { name: "Example Author", screen_name: "example" } },
          },
        },
      };
      const capture = normalizeXPost(raw, postId);
      assert(capture);
      capture.tweet.media = [
        {
          id: mediaId,
          type: "VIDEO",
          url: `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/320x180/test.mp4`,
          width: 320,
          height: 180,
          duration: 1,
        },
        {
          id: photoId,
          type: "PHOTO",
          url: "https://pbs.twimg.com/media/test.jpg",
          width: 320,
          height: 180,
        },
      ];
      capture.tweet.quoted_tweet = {
        ...capture.tweet,
        id: "99",
        url: "https://x.com/example/status/99",
        text: "Context from the quoted post",
        media: [],
      };
      const staged = await page.request.post(endpoint, {
        headers: leased,
        data: { action: "capture", capture },
      });
      expect(staged.status()).toBe(200);
      const videoPath = join(dir, "synthetic.mp4");
      execFileSync(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x180:rate=12",
          "-t",
          "1",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          videoPath,
        ],
        { stdio: "pipe", timeout: 15_000 },
      );
      const photoPath = join(dir, "synthetic.jpg");
      execFileSync(
        "ffmpeg",
        ["-nostdin", "-v", "error", "-i", videoPath, "-frames:v", "1", photoPath],
        { stdio: "pipe", timeout: 15_000 },
      );
      async function upload(
        request: APIRequestContext,
        id: string,
        kind: string,
        path: string,
        mime: string,
      ) {
        const data = await readFile(path);
        const reserved = await request.post(endpoint, {
          headers: leased,
          data: {
            action: "reserve",
            media: {
              mediaId: id,
              kind,
              size: data.length,
              mime,
              sha256: createHash("sha256").update(data).digest("hex"),
            },
          },
        });
        expect(reserved.status()).toBe(200);
        const { asset } = await reserved.json();
        expect(
          (
            await request.put(`${endpoint}/media/${asset.id}`, {
              headers: { ...leased, "content-type": mime },
              data,
            })
          ).status(),
        ).toBe(200);
      }
      await upload(page.request, mediaId, "video", videoPath, "video/mp4");
      await upload(page.request, mediaId, "poster", photoPath, "image/jpeg");
      await upload(page.request, photoId, "photo", photoPath, "image/jpeg");
      expect(
        (
          await page.request.post(endpoint, { headers: leased, data: { action: "complete" } })
        ).status(),
      ).toBe(200);
      // No navigation or manual refresh: the normal foreground poll replaces the card.
      await expect(card.getByTestId("x-bookmark-content")).toBeVisible({ timeout: 20_000 });
      await expect(card.getByRole("link", { name: "Example Author", exact: true })).toBeVisible();
      await card.getByRole("button", { name: "展开全文" }).click();
      await expect(card.getByRole("button", { name: "收起全文" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(card.getByText("Context from the quoted post")).toBeVisible();
      const video = card.getByLabel("已归档的 X 视频");
      await video.evaluate((element) => (element as HTMLVideoElement).play());
      await expect
        .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
        .toBeGreaterThan(0.1);
      await card.getByRole("button", { name: "查看图片 2" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: `.artifacts/connector-${viewport.width}.png`, fullPage: true });
      if (viewport.width > 600) {
        const before = await page.locator('aside img[alt="Zhe"]').boundingBox();
        await page.getByRole("button", { name: "Collapse sidebar" }).click();
        await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
        const after = await page.locator('aside img[alt="Zhe"]').boundingBox();
        expect(Math.abs((before?.x ?? 0) - (after?.x ?? 0))).toBeLessThan(1);
      } else {
        await page.getByRole("button", { name: "Open menu" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
      }
      const uploads = await queryD1<{ id: number; file_type: string; public_url: string }>(
        "SELECT * FROM uploads WHERE user_id=?",
        [owner],
      );
      const archived = uploads.find((item) => item.file_type === "video/mp4");
      assert(archived);
      expect(
        (await page.request.delete(`/api/v1/uploads/${archived.id}`, { headers })).status(),
      ).toBe(200);
      await expect(video).toHaveCount(0, { timeout: 20_000 });
      expect((await fetch(archived.public_url)).status).toBe(404);
      expect(
        await queryD1("SELECT * FROM uploads WHERE user_id=? AND file_type='video/mp4'", [owner]),
      ).toEqual([]);
      // A shorter refreshed post must not inherit a clamp without an expand button.
      await card.getByRole("button", { name: "收起全文" }).click();
      const shortText =
        viewport.width < 600 ? "移动端短帖子内容。".repeat(30) : "一\n二\n三\n四\n五\n六\n末行";
      await executeD1(
        "UPDATE x_bookmarks SET state='pending', attempts=0, next_attempt_at=0 WHERE link_id=? AND user_id=?",
        [linkId, owner],
      );
      const reclaimed = await page.request.post("/api/v1/connector", { headers, data: {} });
      expect(reclaimed.status()).toBe(200);
      const nextJob = (await reclaimed.json()).job;
      expect(nextJob.linkId).toBe(linkId);
      const nextLease = { ...headers, "x-connector-lease": nextJob.leaseToken };
      capture.tweet.text = shortText;
      for (const data of [{ action: "capture", capture }, { action: "complete" }])
        expect((await page.request.post(endpoint, { headers: nextLease, data })).status()).toBe(
          200,
        );
      const text = card.getByTestId("x-bookmark-content").locator("p.whitespace-pre-wrap").first();
      await expect(text).toHaveText(shortText, { timeout: 20_000 });
      expect(await text.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
        true,
      );
      await expect(card.getByRole("button", { name: "展开全文" })).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      if (linkId) await page.request.delete(`/api/v1/links/${linkId}`, { headers });
      await executeD1("DELETE FROM users WHERE id=?", [owner]);
      await rm(dir, { recursive: true, force: true });
    }
  });
}
