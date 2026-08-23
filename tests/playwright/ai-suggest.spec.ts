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
    await executeD1(
      "INSERT INTO folders (id, user_id, name, icon, created_at) VALUES (?, ?, ?, ?, ?)",
      [folderId, TEST_USER.id, folderName, "folder", Math.floor(Date.now() / 1000)],
    );
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
          model: "claude-sonnet-4-5",
          provider: "anthropic",
          durationMs: 12,
        }),
      });
    });

    await page.goto("/dashboard");
    const suggest = page.getByRole("button", { name: "AI 建议" }).first();
    await expect(suggest).toBeVisible();
    await suggest.click();
    await expect(page.getByTestId("suggest-link-org-dialog")).toBeVisible();
    await page.getByTestId("suggest-apply").click();
    await expect(page.getByText("已应用建议").first()).toBeVisible();
    await expect(page.getByText("部分标签未能应用")).toHaveCount(0);
    const badge = page.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`);
    await expect(badge).toBeVisible();
    await page.reload();
    await expect(
      page.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
    ).toBeVisible();
    const assigned = await queryD1<{ folder_id: string | null }>(
      `SELECT folder_id FROM links
       WHERE user_id = ? AND id IN (
         SELECT link_id FROM link_tags
         WHERE tag_id IN (SELECT id FROM tags WHERE user_id = ? AND name = ?)
       )
       LIMIT 1`,
      [TEST_USER.id, TEST_USER.id, tagName],
    );
    expect(assigned[0]?.folder_id).toBe(folderId);
    await executeD1("DELETE FROM tags WHERE user_id = ? AND name = ?", [TEST_USER.id, tagName]);
    await executeD1("DELETE FROM folders WHERE id = ?", [folderId]);
  });
});
