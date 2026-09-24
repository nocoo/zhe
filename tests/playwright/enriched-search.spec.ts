import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test } from "./fixtures";
import { executeD1, queryD1 } from "./helpers/d1";

test("enriched search keyboard and source contexts", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000);
  assert(baseURL === "http://localhost:27006");
  assert(process.env.AUTH_SECRET);
  const owner = `search-browser-${randomUUID()}`;
  await executeD1("INSERT INTO users(id,name) VALUES(?,?)", [owner, "Search Test"]);
  try {
    const urls = ["https://github.com/example/search", "https://x.com/example/status/12345"];
    const ids: number[] = [];
    for (const [index, url] of urls.entries()) {
      const rows = await queryD1<{ id: number }>(
        "INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES(?,?,?,?,?) RETURNING id",
        [owner, randomUUID(), url, index === 0 ? "Search repository" : "Search author", Date.now()],
      );
      assert(rows[0]);
      ids.push(rows[0].id);
    }
    await executeD1(
      "INSERT INTO github_bookmarks(link_id,user_id,source_url,result_json,state,updated_at) VALUES(?,?,?,?,'complete',?)",
      [
        ids[0],
        owner,
        urls[0],
        JSON.stringify({
          fullName: "example/search",
          language: "TypeScript",
          stars: 4242,
          topics: ["rare-topic"],
          readme: `${"padding ".repeat(20000)}café 中文 %_ C++`,
          analysis: { summary: "search AI overview", techStack: ["rare-stack"] },
        }),
        Date.now(),
      ],
    );
    await executeD1(
      "INSERT INTO x_bookmarks(link_id,user_id,source_url,result_json,state,updated_at) VALUES(?,?,?,?,'complete',?)",
      [
        ids[1],
        owner,
        urls[1],
        JSON.stringify({
          tweet: {
            text: "Search post",
            author: { name: "Search Author", username: "rarehandle" },
            entities: { hashtags: ["raretopic"] },
            media: [{ type: "VIDEO" }, { type: "GIF" }],
            quoted_tweet: { text: "rare-quote" },
          },
        }),
        Date.now(),
      ],
    );
    const session = await encode({
      token: { sub: owner, name: "Search Test" },
      secret: process.env.AUTH_SECRET,
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
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto("/dashboard/search?q=Search");
    const input = page.getByRole("textbox", { name: "搜索关键词" });
    await expect(input).toBeFocused();
    await expect(page.locator("[data-search-result]")).toHaveCount(2);
    await input.press("ArrowDown");
    await expect(page.locator("[data-search-result]").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("[data-search-result]").nth(1)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("[data-search-result]").first()).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.locator("[data-search-result]").last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.locator("[data-search-result]").first()).toBeFocused();
    const popup = page.waitForEvent("popup");
    await page.keyboard.press("Enter");
    const opened = await popup;
    await opened.close();
    await input.focus();
    await page.keyboard.press("Control+k");
    const global = page.getByRole("combobox", { name: "全局搜索" });
    await expect(global).toBeFocused();
    await global.fill("rare-stack");
    await expect(
      page.locator('[role="option"]').filter({ hasText: "Search repository" }),
    ).toBeVisible();
    await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText(
      "Search repository",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^GitHub/ })
      .click();
    await expect(
      page.locator('[role="option"]').filter({ hasText: "Search repository" }),
    ).toBeVisible();
    await global.focus();
    await global.fill("example rare-stack");
    await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText(
      "Search repository",
    );
    await global.dispatchEvent("keydown", { key: "Enter", isComposing: true });
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(input).toBeFocused();
    for (const [query, label] of [
      [" CAFÉ\n中文 %_ c++ ", "README"],
      ["#raretopic", "话题"],
      ["rare-quote", "引用帖"],
      ["@rarehandle", "账号"],
      ["@rarehandle 视频", "媒体类型"],
      ["example rare-topic", "GitHub topic"],
    ]) {
      await input.fill(query ?? "");
      await expect(page.locator("[data-search-result]")).toHaveCount(1);
      await expect(page.locator("[data-search-result]")).toContainText(label ?? "");
      await expect(page.locator("[data-search-result] mark").last()).toBeVisible();
    }
    await input.fill("Search");
    await expect(page.locator("[data-search-result]")).toHaveCount(2);
    await page.getByRole("button", { name: /^GitHub/ }).click();
    await expect(page.locator("[data-search-result]")).toHaveCount(1);
    await page.screenshot({
      path: `.artifacts/enriched-search/search-desktop-light.png`,
      fullPage: true,
    });
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "全局搜索" }).fill("theme dark");
    await page.getByText("切换到深色主题", { exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(input).toBeVisible();
    await expect(page.getByRole("button", { name: /^GitHub/ })).toBeVisible();
    await page.screenshot({
      path: `.artifacts/enriched-search/search-mobile-dark.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await input.fill("does-not-exist");
    await expect(page.getByText("没有找到匹配的结果")).toBeVisible();
    await page.route("**/api/search", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "搜索服务暂不可用" }),
      }),
    );
    await input.fill("error");
    await expect(page.getByRole("region", { name: "搜索结果" }).getByRole("alert")).toContainText(
      "搜索服务暂不可用",
    );
    await page.unroute("**/api/search");
    await page.getByRole("button", { name: "重试搜索" }).click();
    await expect(page.getByText("没有找到匹配的结果")).toBeVisible();
    await page.goto("/dashboard");
    await page.goto("/dashboard/search?q=Search");
    await page.getByRole("textbox", { name: "搜索关键词" }).press("Escape");
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await executeD1("DELETE FROM users WHERE id=?", [owner]);
  }
});
