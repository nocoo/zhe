/**
 * E2E: AI suggestion dialog — intercepts the suggest API.
 */
import { expect, test } from "./fixtures";
import { executeD1, TEST_USER } from "./helpers/d1";

test.describe("AI link suggestions", () => {
  test.describe.configure({ timeout: 60_000, retries: 1 });

  test("applies an intercepted folder and tag suggestion", async ({ page }) => {
    const tagName = `e2e-ai-tag-${Date.now()}`;
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
          folders: [{ folderId: null, name: "Inbox", reason: "先放这里" }],
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
    await executeD1("DELETE FROM tags WHERE user_id = ? AND name = ?", [TEST_USER.id, tagName]);
  });
});
