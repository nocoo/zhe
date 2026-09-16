import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test } from "./fixtures";
import { islandHeading } from "./helpers/chrome";
import { executeD1, queryD1 } from "./helpers/d1";

test.describe.configure({ mode: "serial" });
for (const width of [1365, 390]) {
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
        readme: `# Full repository README\n\n[Guide](../guide.md)\n\n${"A paragraph from the full document.\n\n".repeat(80)}END OF README`,
      };
      const completed = await page.request.post(`/api/v1/connector/github/jobs/${job.linkId}`, {
        headers: { ...headers, "x-connector-lease": job.leaseToken },
        data: { action: "complete", repository },
      });
      expect(completed.status()).toBe(200);
      await page.goto("/dashboard/github");
      await expect(islandHeading(page, "GitHub 收藏")).toBeVisible();
      const card = page.getByTestId("github-repository");
      await expect(card.getByTitle("GitHub stars")).toContainText("1,250");
      await expect(card.getByTitle("默认分支 main 的 commit 总数")).toContainText("321");
      await expect(card.getByText("开发收藏", { exact: true })).toBeVisible();
      await expect(card.getByTestId("tag-badge")).toHaveText("待读");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `.artifacts/github-library-${width}.png`,
        animations: "disabled",
      });
      await card.getByRole("button", { name: "阅读 README" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Full repository README" })).toBeVisible();
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
