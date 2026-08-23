/**
 * E2E: AI suggestion dialog — intercepts the suggest API.
 */
import { expect, test } from "./fixtures";

test.describe("AI link suggestions", () => {
  test.describe.configure({ timeout: 60_000, retries: 1 });

  test("applies an intercepted folder and tag suggestion", async ({ page }) => {
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
          tags: [{ tagId: null, name: "e2e-ai-tag", reason: "测试标签" }],
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
  });
});
