import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { normalizeXPost } from "../../cli/src/connector/core";
import { test as base, expect } from "./fixtures";
import { cardAction } from "./helpers/card-actions";
import { executeD1, queryD1 } from "./helpers/d1";

const test = base.extend<{ owner: string }>({
  owner: async ({ context, baseURL }, use) => {
    assert(baseURL === "http://localhost:27006");
    assert(process.env.AUTH_SECRET);
    const owner = `enrichment-${randomUUID()}`;
    await executeD1("INSERT INTO users(id,name,email) VALUES(?,?,?)", [
      owner,
      "Enrichment demo",
      `${owner}@test.local`,
    ]);
    const token = await encode({
      token: { sub: owner, name: "Enrichment demo", email: `${owner}@test.local` },
      secret: process.env.AUTH_SECRET,
      salt: "authjs.session-token",
    });
    await context.clearCookies();
    await context.addCookies([{ name: "authjs.session-token", value: token, url: baseURL }]);
    try {
      await use(owner);
    } finally {
      await executeD1("DELETE FROM users WHERE id=?", [owner]);
    }
  },
});

async function seed(owner: string) {
  const now = Date.now();
  const capture = normalizeXPost(
    {
      rest_id: "2100000000000000002",
      legacy: {
        full_text: "A captured X post with a complete, readable body.",
        created_at: "2026-09-21T00:00:00Z",
      },
      core: {
        user_results: {
          result: { rest_id: "123", legacy: { screen_name: "demo", name: "Demo author" } },
        },
      },
    },
    "2100000000000000002",
  );
  assert(capture);
  const repository = {
    sourceFullName: "demo/repository",
    fullName: "demo/repository",
    description: "A captured GitHub repository",
    stars: 123,
    forks: 4,
    commits: 10,
    language: "TypeScript",
    defaultBranch: "main",
    pushedAt: null,
    archived: false,
    license: "MIT",
    topics: [],
    readme: "# Captured repository\n\nThe README content is available in the enrichment dialog.",
    readmePath: "README.md",
  };
  const items = [
    {
      title: "X failed demo",
      source: "x",
      url: "https://x.com/demo/status/2100000000000000001",
      state: "failed",
      result: null,
    },
    {
      title: "X complete demo",
      source: "x",
      url: "https://x.com/demo/status/2100000000000000002",
      state: "complete",
      result: JSON.stringify(capture),
    },
    {
      title: "GitHub complete demo",
      source: "github",
      url: "https://github.com/demo/repository",
      state: "complete",
      result: JSON.stringify(repository),
    },
    {
      title: "Website complete demo",
      source: "screenshot",
      url: "https://example.com/complete",
      state: "complete",
      result: null,
    },
    {
      title: "Website failed demo",
      source: "screenshot",
      url: "https://example.com/failed",
      state: "failed",
      result: null,
    },
  ];
  const ids: number[] = [];
  for (const item of items) {
    const [link] = await queryD1<{ id: number }>(
      "INSERT INTO links(user_id,slug,original_url,title,meta_title,meta_favicon,screenshot_url,created_at) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
      [
        owner,
        randomUUID(),
        item.url,
        item.title,
        item.title,
        "/logo-24.png",
        item.source === "screenshot" && item.state === "complete" ? "/logo-80.png" : null,
        now,
      ],
    );
    assert(link);
    ids.push(link.id);
    const table = { x: "x_bookmarks", github: "github_bookmarks", screenshot: "screenshot_jobs" }[
      item.source
    ];
    await executeD1(`INSERT INTO ${table}(link_id,user_id,source_url,updated_at) VALUES(?,?,?,?)`, [
      link.id,
      owner,
      item.url,
      now,
    ]);
    await executeD1(`UPDATE ${table} SET state='running',attempts=1,updated_at=? WHERE link_id=?`, [
      now + 1,
      link.id,
    ]);
    await executeD1(
      `UPDATE ${table} SET state='failed',error_code='opencli_unavailable',updated_at=? WHERE link_id=?`,
      [now + 2, link.id],
    );
    if (item.result)
      await executeD1(`UPDATE ${table} SET result_json=? WHERE link_id=?`, [item.result, link.id]);
    await executeD1(`UPDATE ${table} SET state='running',attempts=2,updated_at=? WHERE link_id=?`, [
      now + 3,
      link.id,
    ]);
    await executeD1(
      `UPDATE ${table} SET state=?,attempts=?,error_code=?,updated_at=? WHERE link_id=?`,
      [
        item.state,
        item.state === "failed" ? 5 : 2,
        item.state === "failed" ? "opencli_unavailable" : null,
        now + 4,
        link.id,
      ],
    );
  }
  return ids;
}

for (const width of [1440, 390]) {
  test(`enrichment records, previews and batch retry at ${width}px`, async ({ page, owner }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const ids = await seed(owner);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "补全记录", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "补全记录", exact: true });
    await expect(dialog.getByText("X failed demo", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Website failed demo", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "选择 X complete demo" })).toBeDisabled();
    for (const [index, expected] of [
      [1, "A captured X post with a complete, readable body."],
      [2, "The README content is available in the enrichment dialog."],
      [3, "已保存的网站截图"],
    ] as const) {
      await dialog
        .getByTestId(`enrichment-task-${ids[index]}`)
        .getByRole("button", { name: "详情" })
        .click();
      if (index === 3) await expect(dialog.getByRole("img", { name: expected })).toBeVisible();
      else await expect(dialog.getByText(expected, { exact: true })).toBeVisible();
      await expect(dialog.getByRole("region", { name: "执行记录" })).toContainText("已补全");
      await dialog.getByRole("button", { name: "全部记录" }).click();
    }
    await dialog.getByRole("checkbox", { name: "选择本页可重试任务" }).click();
    await expect(dialog.getByRole("button", { name: "重新补全所选 (2)" })).toBeEnabled();
    await dialog.screenshot({ path: `.artifacts/enrichment-dialog-${width}.png` });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    await dialog.getByRole("button", { name: "重新补全所选 (2)" }).click();
    await expect(page.getByText("已将 2 条任务重新排队", { exact: true })).toBeVisible();
    await expect(dialog.getByTestId(`enrichment-task-${ids[0]}`)).toContainText("等待补全");
    await expect(dialog.getByTestId(`enrichment-task-${ids[4]}`)).toContainText("等待补全");
    await dialog.getByRole("button", { name: "关闭补全记录" }).click();
    await page.goto("/dashboard/x");
    await page
      .getByTestId(`link-card`)
      .filter({ hasText: "X failed demo" })
      .getByRole("button", { name: "查看帖子详情" })
      .click();
    const postDialog = page.getByRole("dialog", { name: "X 帖子", exact: true });
    await expect(postDialog.getByRole("link", { name: "打开原帖" })).toBeVisible();
    await page.keyboard.press("Escape");
    await (
      await cardAction(
        page,
        page.getByTestId("link-card").filter({ hasText: "X failed demo" }),
        "查看补全记录",
      )
    ).click();
    await expect(dialog.getByRole("region", { name: "执行记录" })).toContainText("已加入队列");
    await page.keyboard.press("Escape");
    await page.goto("/dashboard/github");
    await page.getByRole("button", { name: "补全记录", exact: true }).click();
    await expect(dialog.getByText("GitHub complete demo", { exact: true })).toBeVisible();
    await expect(dialog.getByText("X complete demo", { exact: true })).toHaveCount(0);
  });
}
