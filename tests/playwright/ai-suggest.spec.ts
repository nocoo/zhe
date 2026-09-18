import { expect, test } from "./fixtures";
import { executeD1, queryD1, TEST_USER } from "./helpers/d1";

for (const scenario of [
  { source: "web", width: 1365, path: "/dashboard", url: "https://example.com/e2e-ai" },
  {
    source: "github",
    width: 1365,
    path: "/dashboard/github",
    url: "https://github.com/example/e2e-ai",
  },
  {
    source: "x",
    width: 390,
    path: "/dashboard/x",
    url: "https://x.com/example/status/12345678987654321",
  },
]) {
  test(`shared AI editor: ${scenario.source} at ${scenario.width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    const suffix = `${scenario.source}-${Date.now()}`;
    const tagName = `ai-${suffix}`;
    const tagId = `t-${suffix}`;
    const manualTag = `manual-${suffix}`;
    const newTagName = `new-${suffix}`;
    const folderId = `f-${suffix}`;
    const slug = `ai-${suffix}`;
    await executeD1("INSERT INTO folders(id,user_id,name,icon,created_at) VALUES(?,?,?,?,?)", [
      folderId,
      TEST_USER.id,
      "开发资料",
      "folder",
      Date.now(),
    ]);
    await executeD1("INSERT INTO tags(id,user_id,name,color,created_at) VALUES(?,?,?,?,?)", [
      tagId,
      TEST_USER.id,
      tagName,
      "primary",
      Date.now(),
    ]);
    const [seeded] = await queryD1<{ id: number }>(
      "INSERT INTO links(user_id,original_url,slug,meta_title,meta_description,note,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id",
      [
        TEST_USER.id,
        scenario.url,
        slug,
        "Original title",
        "Original description",
        "旧备注",
        Date.now(),
      ],
    );
    if (!seeded) throw new Error("Missing fixture");
    const linkId = seeded.id;
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.route("**/api/settings/ai", (route) =>
      route.fulfill({ contentType: "application/json", body: '{"hasApiKey":true}' }),
    );
    await page.route("**/api/ai/suggest-link-org", async (route) => {
      const [row] = await queryD1<{ revision: number }>(
        "SELECT revision FROM search_documents WHERE resource_id=? AND kind='link'",
        [linkId],
      );
      const events = [
        { type: "stage", stage: "prepare", message: "读取已有资料" },
        {
          type: "context",
          revision: row?.revision,
          supplied: ["URL", "原始标题", "原始简介"],
          notices: scenario.source === "github" ? ["README 未收录，本次使用已有资料整理"] : [],
          current: { title: "", note: "旧备注", folderId: null, tagIds: [] },
          catalogs: {
            folders: [{ id: folderId, name: "开发资料" }],
            tags: [{ id: tagId, name: tagName }],
          },
          historicalAnalysis: null,
          prompt: `url: ${scenario.url}`,
          model: "test-model",
          provider: "custom",
        },
        { type: "stage", stage: "request", message: "等待模型" },
        { type: "stage", stage: "parse", message: "校验结果" },
        {
          type: "result",
          result: {
            title: "整理后的短标题",
            note: "便于检索和阅读的开发资料。",
            folders: [{ folderId, name: "开发资料", reason: "开发相关" }],
            tags: [{ tagId, name: tagName, reason: "检索" }],
            newTags: [{ name: newTagName, reason: "可复用主题" }],
          },
          durationMs: 1200,
          rawText: "model output",
        },
      ];
      await route.fulfill({
        contentType: "application/x-ndjson",
        body: events.map((e) => JSON.stringify(e)).join("\n"),
      });
    });
    try {
      await page.goto(scenario.path);
      const card = page.locator(`[data-link-id="${linkId}"]`).first();
      await expect(card).toBeVisible();
      if (scenario.source === "x") {
        await card.getByRole("button", { name: "更多收藏操作" }).click();
        await page.getByRole("menuitem", { name: "AI 整理" }).click();
      } else await card.getByRole("button", { name: "AI 整理" }).click();
      const dialog = page.getByTestId("suggest-link-org-dialog");
      await expect(page.getByTestId("suggest-title")).toHaveValue("整理后的短标题");
      await expect(page.getByTestId("suggest-step-ready")).toHaveAttribute("data-state", "done");
      if (scenario.source === "github")
        await expect(
          dialog.getByText("README 未收录，本次使用已有资料整理", { exact: true }),
        ).toBeVisible();
      for (const selector of [
        '[data-testid="suggest-link-org-dialog"]',
        "#suggest-title",
        "#suggest-note",
        "#suggest-folder",
      ]) {
        expect(
          await page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor),
        ).toBe("rgb(255, 255, 255)");
      }
      expect(await dialog.getByText(/AI 建议|字数/).count()).toBe(0);
      await expect(dialog.getByRole("region")).toHaveCount(4);
      await expect(dialog.getByText("推荐理由：开发相关")).toBeVisible();
      const suggestedTag = dialog
        .getByRole("region", { name: "4 标签" })
        .getByRole("button", { name: tagName, exact: true })
        .first();
      await expect(suggestedTag).toHaveAttribute("aria-pressed", "true");
      expect(await queryD1("SELECT tag_id FROM link_tags WHERE link_id=?", [linkId])).toHaveLength(
        0,
      );
      await suggestedTag.click();
      await expect(suggestedTag).toHaveAttribute("aria-pressed", "false");
      await suggestedTag.click();
      await expect(suggestedTag).toHaveAttribute("aria-pressed", "true");
      const newSuggestion = dialog.getByRole("button", {
        name: `创建标签 ${newTagName}`,
        exact: true,
      });
      await expect(newSuggestion).toBeVisible();
      expect(
        await queryD1("SELECT id FROM tags WHERE user_id=? AND name=?", [TEST_USER.id, newTagName]),
      ).toHaveLength(0);
      if (scenario.source === "github") {
        await newSuggestion.click();
        await expect(newSuggestion).not.toBeVisible();
        await expect(
          dialog.getByRole("button", { name: newTagName, exact: true }).first(),
        ).toHaveAttribute("aria-pressed", "true");
        expect(
          await queryD1("SELECT id FROM tags WHERE user_id=? AND name=?", [
            TEST_USER.id,
            newTagName,
          ]),
        ).toHaveLength(1);
        expect(
          await queryD1("SELECT tag_id FROM link_tags WHERE link_id=?", [linkId]),
        ).toHaveLength(0);
      }
      expect(
        await dialog
          .getByRole("region")
          .evaluateAll((sections) =>
            sections.every(
              (section, index) =>
                index === 0 ||
                section.getBoundingClientRect().top >=
                  (sections[index - 1]?.getBoundingClientRect().bottom ?? 0),
            ),
          ),
      ).toBe(true);
      expect(
        await queryD1("SELECT id FROM tags WHERE user_id=? AND name=?", [TEST_USER.id, manualTag]),
      ).toHaveLength(0);
      if (scenario.source === "github") {
        await dialog.getByText("管理标签", { exact: true }).click();
        await dialog.getByLabel("新标签名称", { exact: true }).fill(manualTag);
        await dialog.getByRole("button", { name: "创建标签", exact: true }).click();
        await expect(dialog.getByLabel("新标签名称", { exact: true })).toHaveValue("");
        expect(
          await queryD1("SELECT id FROM tags WHERE user_id=? AND name=?", [
            TEST_USER.id,
            manualTag,
          ]),
        ).toHaveLength(1);
        await dialog.getByText("管理标签", { exact: true }).click();
      }
      await page.getByTestId("suggest-title").fill("用户标题");
      await page.getByTestId("suggest-note").fill("用户覆盖后的备注");
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await page.screenshot({
        path: `.artifacts/ai-organization-${scenario.source}-${scenario.width}.png`,
      });
      await page.getByTestId("suggest-apply").click();
      await expect(dialog).not.toBeVisible();
      await page.reload();
      await expect(page.locator(`[data-link-id="${linkId}"]`).first()).toContainText("用户标题");
      await expect(page.locator(`[data-link-id="${linkId}"]`).first()).toContainText(
        "用户覆盖后的备注",
      );
      const [saved] = await queryD1<{ title: string; note: string; folder_id: string }>(
        "SELECT title,note,folder_id FROM links WHERE id=? AND user_id=?",
        [linkId, TEST_USER.id],
      );
      expect(saved).toEqual({ title: "用户标题", note: "用户覆盖后的备注", folder_id: folderId });
      const assigned = await queryD1<{ name: string }>(
        "SELECT t.name FROM tags t JOIN link_tags lt ON lt.tag_id=t.id WHERE lt.link_id=?",
        [linkId],
      );
      expect(assigned.map((t) => t.name)).toContain(tagName);
      if (scenario.source === "github") {
        expect(assigned.map((t) => t.name)).toContain(manualTag);
        expect(assigned.map((t) => t.name)).toContain(newTagName);
      } else {
        expect(
          await queryD1("SELECT id FROM tags WHERE user_id=? AND name=?", [
            TEST_USER.id,
            newTagName,
          ]),
        ).toHaveLength(0);
      }
    } finally {
      await executeD1("DELETE FROM links WHERE id=? AND user_id=?", [linkId, TEST_USER.id]);
      await executeD1("DELETE FROM tags WHERE user_id=? AND name IN (?,?,?)", [
        TEST_USER.id,
        tagName,
        manualTag,
        newTagName,
      ]);
      await executeD1("DELETE FROM folders WHERE id=? AND user_id=?", [folderId, TEST_USER.id]);
    }
  });
}
