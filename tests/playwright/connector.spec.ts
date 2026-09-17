import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "@auth/core/jwt";
import type { APIRequestContext } from "@playwright/test";
import { normalizeXPost, videoFileSize, videoResolution } from "../../cli/src/connector/core";
import { uploadBufferToR2 } from "../../lib/r2/local-fs-backend";
import { expect, test } from "./fixtures";
import { appTitle, islandHeading } from "./helpers/chrome";
import { executeD1, queryD1 } from "./helpers/d1";

test.describe.configure({ mode: "serial" });

test.describe("webpage previews", () => {
  test.use({ deviceScaleFactor: 2 });

  test("publishes, deletes and recaptures a Retina preview without reloading the card", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    assert(baseURL === "http://localhost:27006");
    assert(process.env.D1_PROXY_URL?.startsWith("http://127.0.0.1:"));
    const secret = process.env.AUTH_SECRET;
    assert(secret);
    const owner = `preview-browser-${randomUUID()}`;
    const key = `zhe_${randomUUID().replaceAll("-", "")}`;
    await executeD1("INSERT INTO users(id,name,email) VALUES(?,?,?)", [
      owner,
      "Preview Test",
      `${owner}@test.local`,
    ]);
    try {
      await executeD1(
        "INSERT INTO api_keys(id,prefix,key_hash,user_id,name,scopes,created_at) VALUES(?,?,?,?,?,?,?)",
        [
          randomUUID(),
          key.slice(0, 12),
          createHash("sha256").update(key).digest("hex"),
          owner,
          "Synthetic preview connector",
          "connector:write,links:write",
          Math.floor(Date.now() / 1000),
        ],
      );
      const [link] = await queryD1<{ id: number }>(
        "INSERT INTO links(user_id,original_url,slug,meta_title,created_at) VALUES(?,?,?,?,?) RETURNING id",
        [owner, "https://example.com/article", randomUUID(), "Saved webpage", Date.now()],
      );
      assert(link);
      const session = await encode({
        token: { sub: owner, name: "Preview Test", email: `${owner}@test.local` },
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
      await page.addInitScript(() => localStorage.setItem("zhe_links_view_mode", "grid"));
      await page.setViewportSize({ width: 1365, height: 960 });
      await page.goto("/dashboard");
      const card = page.locator(`[data-testid="link-card"][data-link-id="${link.id}"]`);
      await expect(card).toBeVisible();
      const image = card.getByRole("img", { name: "Screenshot", exact: true });
      await expect(image).toHaveCount(0);
      await expect(card.getByRole("button", { name: "删除截图" })).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Refresh preview" })).toHaveCount(0);
      const headers = { authorization: `Bearer ${key}`, "x-connector-sources": "screenshot" };
      const claims = await Promise.all([
        page.request.post("/api/v1/connector", { headers, data: {} }),
        page.request.post("/api/v1/connector", { headers, data: {} }),
      ]);
      for (const response of claims) expect(response.status()).toBe(200);
      const jobs = (await Promise.all(claims.map((response) => response.json())))
        .map((result) => result.job)
        .filter(Boolean);
      expect(jobs).toHaveLength(1);
      const job = jobs[0];
      expect(job).toMatchObject({ source: "screenshot", linkId: link.id });
      const bytes = await readFile("cli/tests/fixtures/screenshot.webp");
      const upload = (leaseToken = job.leaseToken) =>
        page.request.put(`/api/v1/connector/screenshot/jobs/${link.id}`, {
          headers: {
            ...headers,
            "x-connector-lease": leaseToken,
            "content-type": "image/webp",
            "x-content-sha256": createHash("sha256").update(bytes).digest("hex"),
          },
          data: bytes,
        });
      expect((await upload()).status()).toBe(200);
      expect((await upload()).status()).toBe(200);
      const [saved] = await queryD1<{ screenshot_url: string }>(
        "SELECT screenshot_url FROM links WHERE id=? AND user_id=?",
        [link.id, owner],
      );
      assert(saved);
      await expect(image).toHaveAttribute("src", saved.screenshot_url, { timeout: 20_000 });
      await expect
        .poll(() =>
          image.evaluate((element: HTMLImageElement) => [
            element.naturalWidth,
            element.naturalHeight,
          ]),
        )
        .toEqual([1600, 1200]);
      expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
      for (const width of [1365, 390]) {
        await page.setViewportSize({ width, height: 960 });
        // Measure the 4:3 frame; its bottom border sits outside the image content box.
        await expect
          .poll(() =>
            image.evaluate((element) => {
              const frame = element.parentElement?.parentElement?.getBoundingClientRect();
              return frame ? frame.width / frame.height : 0;
            }),
          )
          .toBeCloseTo(4 / 3, 2);
        await card.screenshot({ path: `.artifacts/connector-preview-${width}.png` });
      }
      const next = await page.request.post("/api/v1/connector", { headers, data: {} });
      expect((await next.json()).job).toBeNull();

      await card.hover();
      await card.getByRole("button", { name: "删除截图" }).click();
      await expect(image).toHaveCount(0);
      await expect(card.getByRole("button", { name: "删除截图" })).toHaveCount(0);
      const [cleared] = await queryD1<{ screenshot_url: string | null }>(
        "SELECT screenshot_url FROM links WHERE id=? AND user_id=?",
        [link.id, owner],
      );
      expect(cleared?.screenshot_url).toBeNull();
      expect((await fetch(saved.screenshot_url)).status).toBe(404);
      expect((await upload()).status()).toBe(409);
      const recapture = await page.request.post("/api/v1/connector", { headers, data: {} });
      const replacement = (await recapture.json()).job;
      expect(replacement).toMatchObject({ source: "screenshot", linkId: link.id });
      expect(replacement.leaseToken).not.toBe(job.leaseToken);
      expect((await upload(replacement.leaseToken)).status()).toBe(200);
      const [recaptured] = await queryD1<{ screenshot_url: string }>(
        "SELECT screenshot_url FROM links WHERE id=? AND user_id=?",
        [link.id, owner],
      );
      assert(recaptured);
      expect(recaptured.screenshot_url).not.toBe(saved.screenshot_url);
      await expect(image).toHaveAttribute("src", recaptured.screenshot_url, { timeout: 20_000 });
      expect((await page.request.delete(`/api/v1/links/${link.id}`, { headers })).status()).toBe(
        200,
      );
      expect((await fetch(recaptured.screenshot_url)).status).toBe(404);
    } finally {
      await executeD1("DELETE FROM users WHERE id=?", [owner]);
    }
  });
});

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
    const mediaRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.resourceType() === "media") mediaRequests.push(request.url());
    });
    try {
      await page.setViewportSize(viewport);
      if (viewport.width < 600) {
        const touch = await context.newCDPSession(page);
        await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
      }
      await page.addInitScript(() => {
        localStorage.setItem("zhe_links_view_mode", "grid");
        localStorage.setItem("zhe_special_sources", JSON.stringify({ github: true, x: true }));
      });
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
      await expect(
        page.getByTestId("link-card").getByRole("button", { name: "查看帖子详情" }),
      ).toHaveAccessibleDescription(/等待补全/);
      const pendingBox = await page.getByTestId("link-card").boundingBox();

      const claim = await page.request.post("/api/v1/connector", { headers, data: {} });
      expect(claim.status()).toBe(200);
      const { job } = await claim.json();
      expect(job.postId).toBe(postId);
      linkId = job.linkId;
      const card = page.locator(`[data-testid="link-card"][data-link-id="${linkId}"]`);
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
      const mediaSize =
        viewport.width < 600 ? { width: 180, height: 320 } : { width: 320, height: 180 };
      capture.tweet.media = [
        {
          id: mediaId,
          type: "VIDEO",
          url: `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/${mediaSize.width}x${mediaSize.height}/test.mp4`,
          width: 0,
          height: 0,
          duration: 1,
        },
        {
          id: photoId,
          type: "PHOTO",
          url: "https://pbs.twimg.com/media/test.jpg",
          ...mediaSize,
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
          `testsrc2=size=${mediaSize.width}x${mediaSize.height}:rate=12`,
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
              ...(kind === "video" ? mediaSize : {}),
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
      // The foreground poll updates a fixed-size summary; full media is opened on demand.
      await expect(card.getByRole("button", { name: "查看帖子详情" })).toHaveAccessibleDescription(
        /已补全/,
        { timeout: 20_000 },
      );
      await expect(card.locator("video")).toHaveCount(0);
      const completedBox = await card.boundingBox();
      assert(pendingBox && completedBox);
      expect(Math.abs(completedBox.height - pendingBox.height)).toBeLessThan(1);
      if (viewport.width < 600) {
        const detailsBox = await card.getByRole("button", { name: "查看帖子详情" }).boundingBox();
        const sourceBox = await card.locator('[title="来源：X"]').boundingBox();
        const editBox = await card
          .getByRole("button", { name: "Edit link", exact: true })
          .boundingBox();
        assert(detailsBox && editBox && sourceBox);
        expect(Math.abs(detailsBox.y - editBox.y)).toBeLessThan(1);
        expect(detailsBox.height).toBe(editBox.height);
        expect(sourceBox.y).toBeGreaterThanOrEqual(detailsBox.y + detailsBox.height);
      }
      await card.getByRole("button", { name: "查看 X 帖子", exact: true }).click();
      const post = page.getByRole("dialog", { name: "X 帖子", exact: true });
      await expect(post.getByTestId("x-bookmark-content")).toBeVisible();
      await expect(post.getByRole("link", { name: "Example Author", exact: true })).toBeVisible();
      await post.getByRole("button", { name: "展开全文" }).click();
      await expect(post.getByRole("button", { name: "收起全文" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(post.getByText("Context from the quoted post")).toBeVisible();
      const video = post.getByLabel("已归档的 X 视频");
      await expect(video).toHaveCount(0);
      expect(mediaRequests).toEqual([]);
      await post.getByRole("button", { name: "播放视频 1" }).click();
      await expect
        .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
        .toBeGreaterThan(0.1);
      await post.getByRole("button", { name: "查看图片 2" }).click();
      await expect(page.getByRole("dialog", { name: "图片预览", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `.artifacts/connector-${viewport.width}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(post).toHaveCount(0);
      await expect(card.locator("video")).toHaveCount(0);

      const design = randomUUID();
      const designName = "Design systems and interaction references";
      const reading = randomUUID();
      const createdAt = Math.floor(Date.now() / 1000);
      for (const [id, name] of [
        [design, designName],
        [reading, "Reading"],
      ])
        await executeD1("INSERT INTO folders(id,user_id,name,created_at) VALUES(?,?,?,?)", [
          id,
          owner,
          name,
          createdAt,
        ]);
      await executeD1("UPDATE links SET folder_id=? WHERE id=? AND user_id=?", [
        design,
        linkId,
        owner,
      ]);
      for (const name of ["Design systems", "Interaction references"]) {
        const tagId = randomUUID();
        await executeD1("INSERT INTO tags(id,user_id,name,color,created_at) VALUES(?,?,?,?,?)", [
          tagId,
          owner,
          name,
          "primary",
          createdAt,
        ]);
        await executeD1("INSERT INTO link_tags(link_id,tag_id) VALUES(?,?)", [linkId, tagId]);
      }
      for (const [id, note, folder, body, url] of [
        [
          "2000000000000000004",
          "Reading article",
          reading,
          "An article worth reading",
          "https://example.org/article",
        ],
        ["2000000000000000005", "A plain note", null, "A short text-only post", null],
        ["2000000000000000006", "Pending post", reading, null, null],
      ] as const) {
        const source = `https://x.com/example/status/${id}`;
        const [saved] = await queryD1<{ id: number }>(
          "INSERT INTO links(user_id,original_url,slug,note,folder_id,meta_title,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id",
          [owner, source, randomUUID().slice(0, 8), note, folder, note, createdAt],
        );
        assert(saved);
        if (body) {
          const extra = normalizeXPost(
            {
              ...raw,
              rest_id: id,
              legacy: {
                ...raw.legacy,
                full_text: body,
                entities: { urls: url ? [{ expanded_url: url }] : [] },
              },
            },
            id,
          );
          assert(extra);
          await executeD1(
            "INSERT INTO x_bookmarks(link_id,user_id,source_url,post_id,state,result_json,updated_at) VALUES(?,?,?,?,'complete',?,?)",
            [saved.id, owner, source, id, JSON.stringify(extra), createdAt],
          );
        }
      }
      const galleryCount = viewport.width > 600 ? 20 : 0;
      for (let index = 0; index < galleryCount; index++) {
        const id = `3000000000000000${String(index).padStart(3, "0")}`;
        const source = `https://x.com/example/status/${id}`;
        const [saved] = await queryD1<{ id: number }>(
          "INSERT INTO links(user_id,original_url,slug,note,created_at) VALUES(?,?,?,?,?) RETURNING id",
          [
            owner,
            source,
            randomUUID().slice(0, 8),
            `Layout study ${index + 1}`,
            createdAt - 3600 - index,
          ],
        );
        assert(saved);
        const extra = normalizeXPost(
          {
            ...raw,
            rest_id: id,
            legacy: {
              ...raw.legacy,
              full_text: "Small details make a useful collection. ".repeat(1 + (index % 3)),
            },
          },
          id,
        );
        assert(extra);
        await executeD1(
          "INSERT INTO x_bookmarks(link_id,user_id,source_url,post_id,state,result_json,updated_at) VALUES(?,?,?,?,'complete',?,?)",
          [saved.id, owner, source, id, JSON.stringify(extra), createdAt],
        );
      }
      const [ordinary] = await queryD1<{ id: number }>(
        "INSERT INTO links(user_id,original_url,slug,meta_title,meta_description,created_at) VALUES(?,?,?,?,?,?) RETURNING id",
        [
          owner,
          "https://example.com",
          randomUUID().slice(0, 8),
          "Normal website",
          "A normal bookmark next to enriched X posts",
          createdAt,
        ],
      );
      assert(ordinary);
      await page.reload();
      await expect(card.getByRole("button", { name: "查看帖子详情" })).toHaveAccessibleDescription(
        /已补全/,
      );
      const normalCard = page.locator(`[data-testid="link-card"][data-link-id="${ordinary.id}"]`);
      const normalBox = await normalCard.boundingBox();
      const xBox = await card.boundingBox();
      assert(normalBox && xBox);
      expect(Math.abs(normalBox.height - xBox.height)).toBeLessThan(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `.artifacts/x-grid-${viewport.width}.png`,
        animations: "disabled",
      });

      const requestsBeforeFeed = mediaRequests.length;
      await page.goto("/dashboard/x");
      await expect(islandHeading(page, "X 收藏")).toBeVisible();
      const feed = page.getByTestId("x-feed");
      await expect(feed.getByTestId("link-card")).toHaveCount(4 + galleryCount);
      const feedCard = feed.locator(`[data-link-id="${linkId}"]`);
      const archiveInfo = feedCard.getByTestId("x-video-archive-info");
      await expect(archiveInfo).toContainText(videoResolution(mediaSize.width, mediaSize.height));
      await expect(archiveInfo).toContainText(videoFileSize((await readFile(videoPath)).length));
      const footer = feedCard.getByTestId("x-card-footer");
      const footerBox = await footer.boundingBox();
      assert(footerBox);
      // Named tags may take two rows below the category and actions.
      expect(footerBox.height).toBeLessThanOrEqual(104);
      expect(await footer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await expect(footer.getByText(designName, { exact: true })).toBeVisible();
      await expect(footer.getByTestId("x-card-tags").locator("[data-tag-name]")).toHaveCount(2);
      await expect(feedCard.getByRole("region", { name: "帖子统计" })).toHaveCount(0);
      await expect(feedCard.getByLabel("引用的 X 帖子")).toHaveCount(0);
      await expect(feedCard.getByRole("button", { name: "展开全文" })).toHaveCount(0);
      const poster = feedCard.getByRole("button", { name: "播放视频 1" });
      await expect(poster).toBeVisible();
      await expect
        .poll(() =>
          poster.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      await expect(feed.locator("video")).toHaveCount(0);
      expect(mediaRequests.length).toBe(requestsBeforeFeed);
      const defaultPosterBox = await poster.boundingBox();
      assert(defaultPosterBox);
      expect(defaultPosterBox.height / defaultPosterBox.width).toBeCloseTo(9 / 16, 1);
      const editMenu = feedCard.getByRole("button", { name: "更多收藏操作" });
      await editMenu.click();
      await page.getByRole("menuitem", { name: "编辑收藏", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "编辑收藏", exact: true });
      await expect(editor).toHaveAttribute("data-phase", "editing");
      const ratio = editor.getByLabel("视频 1 宽高比");
      await expect(ratio).toHaveValue("16:9");
      await ratio.fill("0:9");
      await expect(ratio).toHaveValue("0:9");
      await editor.getByRole("button", { name: "保存", exact: true }).click();
      await expect(editor.getByRole("alert")).toContainText("有效的宽高比");
      await ratio.fill(`${mediaSize.width}:${mediaSize.height}`);
      await editor.getByRole("button", { name: "保存", exact: true }).click();
      await expect(editor).toHaveCount(0);
      await expect(editMenu).toBeFocused();
      const correctedPosterBox = await poster.boundingBox();
      assert(correctedPosterBox);
      expect(correctedPosterBox.height / correctedPosterBox.width).toBeCloseTo(
        mediaSize.height / mediaSize.width,
        1,
      );
      await page.reload();
      await expect(poster).toBeVisible();
      const persisted = await queryD1<{ width: number; height: number }>(
        "SELECT json_extract(result_json,'$.tweet.media[0].width') AS width,json_extract(result_json,'$.tweet.media[0].height') AS height FROM x_bookmarks WHERE link_id=? AND user_id=?",
        [linkId, owner],
      );
      expect(persisted).toEqual([mediaSize]);
      await expect(feed.locator("video")).toHaveCount(0);
      expect(mediaRequests.length).toBe(requestsBeforeFeed);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `.artifacts/x-library-${viewport.width}.png`,
        animations: "disabled",
      });
      await feedCard.screenshot({
        path: `.artifacts/x-card-${viewport.width}.png`,
        animations: "disabled",
      });
      if (viewport.width > 600) {
        for (const width of [1920, 2560]) {
          await page.setViewportSize({ width, height: viewport.height });
          await expect
            .poll(() =>
              feed
                .getByTestId("link-card")
                .evaluateAll(
                  (cards) =>
                    new Set(cards.map((card) => Math.round(card.getBoundingClientRect().x))).size,
                ),
            )
            .toBe(8);
          expect(
            await feed
              .locator('[data-testid="link-card"], [data-testid="x-card-footer"]')
              .evaluateAll((elements) =>
                elements.every((element) => element.scrollWidth <= element.clientWidth),
              ),
          ).toBe(true);
          const posterBox = await poster.boundingBox();
          assert(posterBox);
          expect(posterBox.height / posterBox.width).toBeCloseTo(
            mediaSize.height / mediaSize.width,
            1,
          );
          await page.screenshot({
            path: `.artifacts/x-library-${width}.png`,
            animations: "disabled",
          });
        }
        await page.emulateMedia({ colorScheme: "dark" });
        await expect(page.locator("html")).toHaveClass(/dark/);
        await page.screenshot({
          path: ".artifacts/x-library-2560-dark.png",
          animations: "disabled",
        });
        await page.emulateMedia({ colorScheme: "light" });
        await page.setViewportSize(viewport);
      }
      const menu = feedCard.getByRole("button", { name: "更多收藏操作" });
      await menu.click();
      await expect(page.getByRole("menuitem", { name: "编辑收藏" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "打开原帖" })).toHaveAttribute(
        "href",
        `https://x.com/example/status/${postId}`,
      );
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await poster.click();
      await expect
        .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
        .toBeGreaterThan(0.1);
      await expect(feed.locator("video")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(poster).toBeFocused();
      await expect(page.locator("video")).toHaveCount(0);
      const details = feedCard.getByRole("button", { name: "查看帖子详情" });
      await details.click();
      await expect(post.getByRole("region", { name: "帖子统计" })).toBeVisible();
      await expect(post.getByRole("button", { name: "查看图片 2" })).toBeVisible();
      await expect(post.getByText("Design systems", { exact: true })).toBeVisible();
      await expect(post.getByText("Interaction references", { exact: true })).toBeVisible();
      await expect(post.getByRole("button", { name: "播放视频 1" })).toBeVisible();
      await expect(page.locator("video")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(details).toBeFocused();
      await page.getByRole("button", { name: "图片", exact: true }).click();
      await expect(feed.getByTestId("link-card")).toHaveCount(1);
      await page.getByRole("combobox", { name: "筛选分类" }).click();
      await page.getByRole("option", { name: "Reading", exact: true }).click();
      await expect(page.getByText("没有符合条件的 X 收藏")).toBeVisible();
      await page.getByRole("button", { name: "文章", exact: true }).click();
      await expect(feed.getByTestId("link-card")).toHaveCount(1);
      await expect(feed.getByText("Reading article", { exact: true })).toBeVisible();
      await page.getByRole("searchbox", { name: "搜索 X 收藏" }).fill("not present");
      await expect(page.getByText("没有符合条件的 X 收藏")).toBeVisible();
      await page.getByRole("button", { name: "清除筛选", exact: true }).first().click();
      await page.getByRole("button", { name: "待补全", exact: true }).click();
      await expect(feed.getByTestId("link-card")).toHaveCount(1);
      await expect(feed.getByTestId("link-card")).toContainText("Pending post");
      await page.goto("/dashboard");
      await expect(card.getByRole("button", { name: "查看帖子详情" })).toHaveAccessibleDescription(
        /已补全/,
      );
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
      await card.getByRole("button", { name: "查看 X 帖子", exact: true }).click();
      await post.getByRole("button", { name: "播放视频 1" }).click();
      await expect(video).toBeVisible();
      const uploads = await queryD1<{ id: number; file_type: string; public_url: string }>(
        "SELECT * FROM uploads WHERE user_id=?",
        [owner],
      );
      const archived = uploads.find((item) => item.file_type === "video/mp4");
      assert(archived);
      const filesPage = await context.newPage();
      try {
        await filesPage.setViewportSize(viewport);
        await filesPage.goto("/dashboard/uploads");
        await expect(filesPage.getByTestId("upload-item")).toHaveCount(3);
        const videoFile = filesPage
          .getByTestId("upload-item")
          .filter({ hasText: `${mediaId}.mp4` });
        await videoFile.getByRole("button", { name: "Delete file" }).click();
        await filesPage.getByTestId("upload-delete-confirm").click();
        await expect(filesPage.getByTestId("upload-item")).toHaveCount(1);
        await expect(filesPage.getByTestId("upload-file-name")).toHaveText(`${photoId}.jpg`);
      } finally {
        await filesPage.close();
        await page.bringToFront();
      }
      await expect(video).toHaveCount(0, { timeout: 20_000 });
      expect((await fetch(archived.public_url)).status).toBe(404);
      expect(
        await queryD1("SELECT * FROM uploads WHERE user_id=? AND file_type='video/mp4'", [owner]),
      ).toEqual([]);
      // A shorter refreshed post must not inherit a clamp without an expand button.
      await post.getByRole("button", { name: "展开全文" }).click();
      await post.getByRole("button", { name: "收起全文" }).click();
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
      const text = post.getByTestId("x-bookmark-content").locator("p.whitespace-pre-wrap").first();
      await expect(text).toHaveText(shortText, { timeout: 20_000 });
      expect(await text.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
        true,
      );
      await expect(post.getByRole("button", { name: "展开全文" })).toHaveCount(0);
      if (viewport.width > 600) {
        assert(process.env.LOCAL_R2 === "1");
        const id = "4000000000000000001";
        const source = `https://x.com/example/status/${id}`;
        const [gallery] = await queryD1<{ id: number }>(
          "INSERT INTO links(user_id,original_url,slug,created_at) VALUES(?,?,?,?) RETURNING id",
          [owner, source, randomUUID().slice(0, 8), createdAt + 60],
        );
        assert(gallery);
        const album = {
          ...capture,
          tweet: { ...capture.tweet, id, url: source, text: "横竖混排 · 完整画面" },
        };
        const shapes = [
          { width: 180, height: 320 },
          { width: 320, height: 180 },
          { width: 240, height: 240 },
          { width: 240, height: 320 },
        ];
        album.tweet.media = shapes.map((shape, index) => ({
          id: `${id}${index}`,
          type: "PHOTO" as const,
          url: `https://pbs.twimg.com/media/gallery${index}.jpg`,
          ...shape,
        }));
        await executeD1(
          "INSERT INTO x_bookmarks(link_id,user_id,source_url,post_id,state,result_json,updated_at) VALUES(?,?,?,?,'complete',?,?)",
          [gallery.id, owner, source, id, JSON.stringify(album), Date.now()],
        );
        for (const [index, media] of album.tweet.media.entries()) {
          const path = join(dir, `gallery-${index}.jpg`);
          execFileSync("ffmpeg", [
            "-nostdin",
            "-v",
            "error",
            "-i",
            photoPath,
            "-vf",
            `scale=${media.width}:${media.height}`,
            "-frames:v",
            "1",
            path,
          ]);
          const bytes = await readFile(path);
          const key = `fixture/${owner}/${index}.jpg`;
          await uploadBufferToR2(key, bytes, "image/jpeg");
          const [upload] = await queryD1<{ id: number }>(
            "INSERT INTO uploads(user_id,key,file_name,file_type,file_size,public_url,created_at) VALUES(?,?,?,'image/jpeg',?,?,?) RETURNING id",
            [
              owner,
              key,
              `${index}.jpg`,
              bytes.length,
              `http://127.0.0.1:18788/r2/${key}`,
              Date.now(),
            ],
          );
          assert(upload);
          await executeD1(
            "INSERT INTO x_media(id,link_id,user_id,media_id,kind,r2_key,mime,size,sha256,lease_token,state,upload_id,created_at) VALUES(?,?,?,?,'photo',?,'image/jpeg',?,?,'fixture','published',?,?)",
            [
              randomUUID(),
              gallery.id,
              owner,
              media.id,
              key,
              bytes.length,
              createHash("sha256").update(bytes).digest("hex"),
              upload.id,
              Date.now(),
            ],
          );
        }
        await page.goto("/dashboard/x");
        await page.setViewportSize({ width: 1920, height: 960 });
        const albumCard = page.locator(`[data-testid="link-card"][data-link-id="${gallery.id}"]`);
        for (const count of [1, 2, 3, 4]) {
          await executeD1("UPDATE x_bookmarks SET result_json=? WHERE link_id=? AND user_id=?", [
            JSON.stringify({
              ...album,
              tweet: { ...album.tweet, media: album.tweet.media.slice(0, count) },
            }),
            gallery.id,
            owner,
          ]);
          await page.reload();
          const photos = albumCard.getByRole("button", { name: /^查看图片/ });
          await expect(photos).toHaveCount(count);
          for (let index = 0; index < count; index++) {
            const photo = photos.nth(index).locator("img");
            await expect
              .poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
              .toBeGreaterThan(0);
            const box = await photo.boundingBox();
            const shape = shapes[index];
            assert(box && shape);
            expect(box.height / box.width).toBeCloseTo(shape.height / shape.width, 2);
          }
          await albumCard.screenshot({
            path: `.artifacts/x-photos-${count}.png`,
            animations: "disabled",
          });
        }
        await albumCard.getByRole("button", { name: "查看图片 4" }).click();
        const photoDialog = page.getByRole("dialog", { name: "图片预览" });
        await expect(photoDialog).toBeVisible();
        await expect(photoDialog.getByRole("img")).toHaveAttribute("src", /\/3\.jpg$/);
      }
      expect(errors).toEqual([]);
    } finally {
      if (linkId) await page.request.delete(`/api/v1/links/${linkId}`, { headers });
      await executeD1("DELETE FROM users WHERE id=?", [owner]);
      await rm(dir, { recursive: true, force: true });
    }
  });
}
