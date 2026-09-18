import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test } from "./fixtures";
import { islandHeading } from "./helpers/chrome";
import { executeD1, queryD1 } from "./helpers/d1";

test.describe.configure({ mode: "serial" });
for (const width of [1920, 1365, 390, 320]) {
  test(`source filters and GitHub README at ${width}px`, async ({ page, context, baseURL }) => {
    test.setTimeout(90_000);
    assert(baseURL === "http://localhost:27006");
    assert(process.env.D1_PROXY_URL?.startsWith("http://127.0.0.1:"));
    const secret = process.env.AUTH_SECRET;
    assert(secret);
    const owner = `github-browser-${randomUUID()}`;
    const key = `zhe_${randomUUID().replaceAll("-", "")}`;
    const keyId = randomUUID();
    const folderId = randomUUID();
    const tagId = randomUUID();
    await executeD1("INSERT INTO users(id,name,email) VALUES(?,?,?)", [
      owner,
      "GitHub Test",
      `${owner}@test.local`,
    ]);
    try {
      await executeD1(
        "INSERT INTO api_keys(id,prefix,key_hash,user_id,name,scopes,created_at) VALUES(?,?,?,?,?,?,?)",
        [
          keyId,
          key.slice(0, 12),
          createHash("sha256").update(key).digest("hex"),
          owner,
          "Synthetic connector",
          "connector:write",
          Math.floor(Date.now() / 1000),
        ],
      );
      await executeD1("INSERT INTO folders(id,user_id,name,icon,created_at) VALUES(?,?,?,?,?)", [
        folderId,
        owner,
        "开发收藏",
        "folder",
        Date.now(),
      ]);
      await executeD1("INSERT INTO tags(id,user_id,name,color,created_at) VALUES(?,?,?,?,?)", [
        tagId,
        owner,
        "待读",
        "blue",
        Date.now(),
      ]);
      const urls = [
        "https://github.com/octocat/Hello-World",
        "https://x.com/example/status/123456789",
        "https://example.com/ordinary",
        "https://x.com/i/article/123456789",
      ];
      const ids: number[] = [];
      for (const [index, url] of urls.entries()) {
        const [row] = await queryD1<{ id: number }>(
          "INSERT INTO links(user_id,original_url,slug,folder_id,meta_title,meta_description,meta_favicon,created_at) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
          [
            owner,
            url,
            randomUUID(),
            index < 2 ? folderId : null,
            ["GitHub repository", "Saved X post", "Ordinary bookmark", "X article"][index],
            "Saved bookmark",
            "/logo-24.png",
            Date.now(),
          ],
        );
        assert(row);
        ids.push(row.id);
      }
      for (const id of ids.slice(0, 2))
        await executeD1("INSERT INTO link_tags(link_id,tag_id) VALUES(?,?)", [id, tagId]);
      const session = await encode({
        token: { sub: owner, name: "GitHub Test", email: `${owner}@test.local` },
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
      await page.setViewportSize({ width, height: 960 });
      await page.goto("/dashboard");
      await expect(islandHeading(page, "全部链接")).toBeVisible();
      await expect(page.getByTestId("link-card")).toHaveCount(2);
      await page.goto("/dashboard?folder=uncategorized");
      await expect(page.getByTestId("link-card")).toHaveCount(1);
      if (width < 768) await page.getByRole("button", { name: "筛选与视图" }).click();
      await page.getByLabel("特殊来源", { exact: true }).click();
      await expect(page.getByRole("checkbox", { name: "GitHub", exact: true })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: "X（全部内容）" })).not.toBeChecked();
      await page.getByRole("checkbox", { name: "X（全部内容）" }).check();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("link-card")).toHaveCount(2);
      await page.reload();
      await expect(page.getByTestId("link-card")).toHaveCount(2);
      await page.goto(`/dashboard?folder=${folderId}`);
      await expect(page.getByTestId("link-card")).toHaveCount(2);
      if (width < 768) await page.getByRole("button", { name: "筛选与视图" }).click();
      await page.getByLabel("特殊来源", { exact: true }).click();
      await page.getByRole("checkbox", { name: "GitHub", exact: true }).uncheck();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("link-card")).toHaveCount(1);
      // Reset directly through the same persisted preference before entering source-specific views.
      await page.evaluate(() => {
        localStorage.removeItem("zhe_special_sources");
        window.dispatchEvent(new Event("storage"));
      });
      await page.keyboard.press("Escape");

      const headers = { authorization: `Bearer ${key}`, "x-connector-sources": "github,x" };
      const claimed = await page.request.post("/api/v1/connector", { headers, data: {} });
      expect(claimed.status()).toBe(200);
      const { job } = await claimed.json();
      expect(job).toMatchObject({ source: "github", linkId: ids[0] });
      const repository = {
        sourceFullName: "octocat/Hello-World",
        fullName: "octocat/Hello-World",
        description: "A repository with a complete README",
        stars: 1250,
        commits: 321,
        forks: 42,
        language: "TypeScript",
        defaultBranch: "main",
        pushedAt: "2026-09-12T00:00:00Z",
        archived: false,
        license: "MIT",
        topics: ["bookmarks", "productivity"],
        readmePath: ".github/README.md",
        readme: `# Full repository README\n\n[Guide](../guide.md)\n\n    bun run dev\n\n${"A paragraph from the full document.\n\n".repeat(80)}END OF README`,
      };
      const completed = await page.request.post(`/api/v1/connector/github/jobs/${job.linkId}`, {
        headers: { ...headers, "x-connector-lease": job.leaseToken },
        data: { action: "complete", repository },
      });
      expect(completed.status()).toBe(200);
      const analysis = {
        summary: "保存和整理开发资料，支持搜索仓库与阅读完整文档。",
        features: ["全文归档", "统一搜索"],
        useCases: ["个人知识管理"],
        techStack: ["TypeScript"],
        tags: ["知识管理", "开发工具"],
        model: "test-model",
        provider: "custom",
        generatedAt: Date.now(),
      };
      // Mix long content, many topics, archived/failed snapshots and an uncaptured repo.
      for (let index = 1; index <= 5; index++) {
        const fullName = `fixture/repository-${index}${index === 1 ? "-with-a-long-name-that-must-wrap-without-growing-the-card" : ""}`;
        const url = `https://github.com/${fullName}`;
        const [extra] = await queryD1<{ id: number }>(
          "INSERT INTO links(user_id,original_url,slug,meta_description,note,created_at) VALUES(?,?,?,?,?,?) RETURNING id",
          [
            owner,
            url,
            randomUUID(),
            "Saved description",
            index === 3 ? analysis.summary : "A long personal note. ".repeat(index * 20),
            Date.now(),
          ],
        );
        assert(extra);
        if (index === 1) {
          for (let tagIndex = 0; tagIndex < 5; tagIndex++) {
            const extraTag = randomUUID();
            await executeD1(
              "INSERT INTO tags(id,user_id,name,color,created_at) VALUES(?,?,?,?,?)",
              [extraTag, owner, `收藏标签 ${tagIndex + 1}`, "primary", Date.now()],
            );
            await executeD1("INSERT INTO link_tags(link_id,tag_id) VALUES(?,?)", [
              extra.id,
              extraTag,
            ]);
          }
        }
        if (index === 5) continue;
        await executeD1(
          "INSERT INTO github_bookmarks(link_id,user_id,source_url,state,result_json,error_code,captured_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
          [
            extra.id,
            owner,
            url,
            index === 4 ? "failed" : "complete",
            JSON.stringify({
              ...repository,
              sourceFullName: fullName,
              fullName,
              description: "A much longer description with detailed project capabilities. ".repeat(
                index * 20,
              ),
              topics: Array.from({ length: 12 }, (_, topic) => `topic-${topic}-with-long-label`),
              archived: index === 2,
              ...(index === 2
                ? {
                    stars: 1234567,
                    commits: 23456789,
                    forks: 12345,
                    language: "A very long language name",
                    defaultBranch: "a-very-long-default-branch-name",
                    license: "A very long license name",
                  }
                : {}),
              ...(index === 3
                ? { analysis, language: null, license: "NOASSERTION", topics: [] }
                : {}),
            }),
            index === 4 ? "github_rate_limited" : null,
            Date.now(),
            Date.now(),
          ],
        );
      }
      await page.goto("/dashboard/github");
      await expect(islandHeading(page, "GitHub 收藏")).toBeVisible();
      await expect(page.getByRole("searchbox", { name: "搜索 GitHub 收藏" })).toHaveCount(0);
      if (width >= 768) {
        const heading = await islandHeading(page, "GitHub 收藏").boundingBox();
        const filter = await page.getByRole("combobox", { name: "仓库排序" }).boundingBox();
        assert(heading && filter);
        expect(
          Math.abs(heading.y + heading.height / 2 - filter.y - filter.height / 2),
        ).toBeLessThan(2);
        expect(filter.x).toBeGreaterThan(heading.x);
      }
      const cards = page.getByTestId("github-repository");
      await expect(cards).toHaveCount(6);
      const card = page.locator(`[data-testid="github-repository"][data-link-id="${ids[0]}"]`);
      await expect(card.getByTitle("GitHub stars · 1,250")).toContainText("1.3K");
      await expect(card.getByTitle("默认分支 main 的 commit 总数 · 321")).toContainText("321");
      await expect(card.getByText("开发收藏", { exact: true })).toBeVisible();
      await expect(card.getByTestId("tag-badge")).toHaveText("待读");
      await expect(cards.getByText(analysis.summary, { exact: true })).toHaveCount(1);
      await expect(cards.getByText("全文归档 · 统一搜索", { exact: true })).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      // Metadata loading moves cards; measure the settled layout, not a reflow frame.
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      const geometry = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, left: rect.left, top: rect.top, bottom: rect.bottom };
        }),
      );
      const heights = geometry.map((box) => box.height);
      // Each column stays compact even when neighboring cards have more content.
      for (const box of geometry) {
        const above = geometry
          .filter((other) => Math.abs(other.left - box.left) < 1 && other.top < box.top)
          .sort((a, b) => b.top - a.top)[0];
        if (above) expect(Math.abs(box.top - above.bottom - 12)).toBeLessThan(1);
      }
      expect(Math.max(...heights)).toBeLessThan(260);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
      const rowGeometry = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const top = element.getBoundingClientRect().top;
          return [
            "h2",
            '[data-testid="github-card-tags"]',
            '[data-testid="github-card-description"]',
            '[data-testid="github-card-metrics"]',
            '[data-testid="github-card-metadata"]',
            '[data-testid="github-card-footer"]',
          ].map((selector) => {
            const row = element.querySelector(selector);
            if (!row) throw new Error(`Missing card row: ${selector}`);
            const box = row.getBoundingClientRect();
            return { top: box.top - top, height: box.height };
          });
        }),
      );
      for (const rows of rowGeometry) expect(rows).toEqual(rowGeometry[0]);
      expect(
        await cards.evaluateAll((elements) =>
          elements.every((element) => {
            const metadata = element.querySelector('[data-testid="github-card-metadata"]');
            if (metadata?.getAttribute("role") === "status") return true;
            const metrics = element.querySelector('[data-testid="github-card-metrics"]');
            return Array.from(metadata?.children ?? []).every((cell, index) => {
              const metric = metrics?.children[index];
              return (
                metric &&
                Math.abs(cell.getBoundingClientRect().left - metric.getBoundingClientRect().left) <
                  1
              );
            });
          }),
        ),
      ).toBe(true);
      for (const metric of await cards.getByTestId("github-card-metrics").all()) {
        expect(await metric.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        const items = await metric.locator(":scope > div").evaluateAll((elements) =>
          elements.map((element) => {
            const { top, height } = element.getBoundingClientRect();
            return { top, height, fits: element.scrollWidth <= element.clientWidth };
          }),
        );
        expect(
          items.every((item) => item.top === items[0]?.top && item.height === 20 && item.fits),
          JSON.stringify(items),
        ).toBe(true);
      }
      const rows = geometry.reduce<Record<number, number>>((counts, box) => {
        counts[box.top] = (counts[box.top] ?? 0) + 1;
        return counts;
      }, {});
      expect(Math.max(...Object.values(rows))).toBeLessThanOrEqual(4);
      if (width === 1920) expect(Math.max(...Object.values(rows))).toBe(4);
      if (width <= 390) expect(Math.max(...Object.values(rows))).toBe(1);
      const footer = card.getByTestId("github-card-footer");
      await expect(footer.getByTestId("tag-badge")).toHaveCount(0);
      const brand = await card.getByTitle("来源：GitHub").boundingBox();
      const title = await card.getByRole("heading").boundingBox();
      const tags = await card.getByTestId("github-card-tags").boundingBox();
      assert(brand && title && tags);
      expect(brand.x).toBeGreaterThan(title.x + title.width);
      expect(tags.y).toBeGreaterThan(title.y + title.height);
      const labels = cards
        .filter({ hasText: "fixture/repository-1-with-a-long-name" })
        .getByTestId("github-card-tags");
      await expect(labels.getByTestId("github-repository-label")).toHaveCount(12);
      await expect(labels.getByTestId("tag-badge")).toHaveCount(5);
      await labels.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => labels.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await labels.getByTestId("github-repository-label").last().scrollIntoViewIfNeeded();
      await expect(labels.getByTestId("github-repository-label").last()).toBeInViewport();
      await labels.evaluate((element) => {
        element.scrollLeft = 0;
      });
      const readButton = footer.getByRole("button", { name: "阅读 README" });
      const moreButton = footer.getByRole("button", { name: "更多收藏操作" });
      const readBox = await readButton.boundingBox();
      const moreBox = await moreButton.boundingBox();
      assert(readBox && moreBox);
      expect(Math.abs(readBox.y - moreBox.y)).toBeLessThan(1);
      expect(moreBox.x).toBeGreaterThan(readBox.x);
      const cardHeight = await card.evaluate((element) => element.getBoundingClientRect().height);
      await moreButton.click();
      await expect(page.getByRole("menuitem", { name: "打开原仓库" })).toHaveAttribute(
        "href",
        urls[0] as string,
      );
      await page.getByRole("menuitem", { name: "编辑收藏" }).click();
      await expect(page.getByTestId("card-edit-dialog")).toHaveAttribute("data-phase", "editing");
      expect(await card.evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(
        cardHeight,
        2,
      );
      await page.getByRole("button", { name: "收起", exact: true }).click();
      await expect(page.getByTestId("card-edit-dialog")).not.toBeAttached();
      await expect(moreButton).toBeFocused();
      await islandHeading(page, "GitHub 收藏").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `.artifacts/github-library-${width}.png`,
        animations: "disabled",
      });
      await card.getByRole("button", { name: "阅读 README" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Full repository README" })).toBeVisible();
      for (const surface of [dialog, dialog.locator("pre"), dialog.locator("pre code")]) {
        expect(await surface.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
          "rgb(255, 255, 255)",
        );
      }
      await expect(dialog.getByRole("link", { name: "Guide", exact: true })).toHaveAttribute(
        "href",
        "https://github.com/octocat/Hello-World/blob/main/guide.md",
      );
      await dialog.getByText("END OF README", { exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByText("END OF README", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "关闭 README" })).toBeInViewport();
      await dialog.getByRole("button", { name: "Markdown 原文" }).click();
      await expect(dialog.locator("pre code")).toHaveText(repository.readme);
      await dialog.getByRole("button", { name: "阅读视图" }).click();
      await dialog
        .getByRole("heading", { name: "Full repository README" })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `.artifacts/github-readme-${width}.png`,
        animations: "disabled",
      });
      await dialog.getByRole("button", { name: "关闭 README" }).click();
      await expect(dialog).toBeHidden();
      await page.goto("/dashboard/x");
      await expect(islandHeading(page, "X 收藏")).toBeVisible();
      await expect(page.getByTestId("x-card-tags")).toHaveText("待读");
      await page.getByRole("button", { name: "标签", exact: true }).click();
      await page.getByRole("option", { name: "待读", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("link-card")).toHaveCount(1);
    } finally {
      await executeD1("DELETE FROM users WHERE id=?", [owner]);
    }
  });
}
