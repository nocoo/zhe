/**
 * E2E: AI suggestion dialog — intercepts the suggest API.
 */
import { expect, test } from "./fixtures";
import { executeD1, queryD1, TEST_USER } from "./helpers/d1";

test.describe("AI link suggestions", () => {
  test.describe.configure({ timeout: 60_000, retries: 1 });

  test("applies an intercepted folder and tag suggestion", async ({ page }) => {
    const tagName = `e2e-ai-tag-${Date.now()}`;
    const folderId = `e2e-ai-folder-${Date.now()}`;
    const folderName = `AI Folder ${Date.now()}`;
    const slug = `e2e-ai-${Date.now()}`;
    await executeD1(
      "INSERT INTO folders (id, user_id, name, icon, created_at) VALUES (?, ?, ?, ?, ?)",
      [folderId, TEST_USER.id, folderName, "folder", Math.floor(Date.now() / 1000)],
    );
    await executeD1(
      "INSERT INTO links (user_id, original_url, slug, is_custom, clicks, created_at) VALUES (?, ?, ?, 1, 0, ?)",
      [TEST_USER.id, "https://example.com/e2e-ai-suggest", slug, Date.now()],
    );
    const seeded = await queryD1<{ id: number }>(
      "SELECT id FROM links WHERE user_id = ? AND slug = ?",
      [TEST_USER.id, slug],
    );
    const linkId = seeded[0]?.id;
    expect(linkId).toBeDefined();
    await page.route("**/api/settings/ai", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            provider: "anthropic",
            model: "claude-sonnet-4-5",
            baseURL: "",
            sdkType: "",
            authType: "",
            hasApiKey: true,
            apiKeyLast4: "1234",
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.route("**/api/ai/suggest-link-org", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          folders: [{ folderId, name: folderName, reason: "归入此文件夹" }],
          tags: [{ tagId: null, name: tagName, reason: "测试标签" }],
          note: "e2e 备注总结",
          catalogs: { folders: [{ id: folderId, name: folderName }], tags: [] },
          model: "claude-sonnet-4-5",
          provider: "anthropic",
          durationMs: 12,
          prompt: "url: https://example.com/e2e-ai-suggest",
          rawText: '{"folders":[],"tags":[]}',
        }),
      });
    });

    try {
      await page.goto("/dashboard");
      const card = page.locator('[data-testid="link-card"]').filter({ hasText: slug });
      const suggest = card.getByRole("button", { name: "AI 建议" });
      await expect(suggest).toBeVisible();
      await suggest.click();
      await expect(page.getByTestId("suggest-link-org-dialog")).toBeVisible();
      await expect(page.getByTestId("suggest-step-ready")).toHaveAttribute("data-state", "done");
      await expect(page.getByTestId("suggest-prompt-body")).toHaveCount(0);
      await page.getByTestId("suggest-prompt-toggle").click();
      await expect(page.getByTestId("suggest-prompt-body")).toContainText("e2e-ai-suggest");
      await expect(page.getByTestId("suggest-note")).toHaveValue("e2e 备注总结");
      await page.getByTestId("suggest-note").fill("用户改过的备注");
      await page.getByTestId("suggest-apply").click();
      await expect(page.getByText("已应用建议").first()).toBeVisible();
      await expect(page.getByText("部分标签未能应用")).toHaveCount(0);
      const badge = page.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`);
      await expect(badge).toBeVisible();
      await page.reload();
      await expect(
        page.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
      ).toBeVisible();
      const assigned = await queryD1<{ folder_id: string | null; note: string | null }>(
        "SELECT folder_id, note FROM links WHERE id = ? AND user_id = ?",
        [linkId, TEST_USER.id],
      );
      expect(assigned[0]?.folder_id).toBe(folderId);
      expect(assigned[0]?.note).toBe("用户改过的备注");
    } finally {
      await executeD1("DELETE FROM link_tags WHERE link_id = ?", [linkId]);
      await executeD1("DELETE FROM tags WHERE user_id = ? AND name = ?", [TEST_USER.id, tagName]);
      await executeD1("DELETE FROM links WHERE id = ?", [linkId]);
      await executeD1("DELETE FROM folders WHERE id = ?", [folderId]);
    }
  });
});
