/**
 * E2E: Short link 307 redirect and 404 fallback — the core product flow.
 */
import { expect, test } from "./fixtures";

async function waitForLinksPage(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("main").getByRole("button", { name: "刷新链接" }).waitFor({ timeout: 15_000 });
}

test.describe("Short link redirect", () => {
  test("visiting a short link returns 307 redirect to target URL", async ({ page, request }) => {
    const slug = `e2e-redir-${Date.now()}`;
    const targetUrl = "https://example.com/redirect-test";

    await page.goto("/dashboard");
    await waitForLinksPage(page);

    const main = page.locator("main");
    await main.getByRole("button", { name: "新建链接", exact: true }).click();
    await page.locator('button:has-text("自定义 slug")').click();
    await page.locator("#url").fill(targetUrl);
    await page.locator("#slug").fill(slug);
    await page.locator('button:has-text("创建链接")').click();
    await expect(page.getByText("创建短链接")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: `/${slug}`, exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const response = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(targetUrl);
  });

  test("non-existent slug shows 404 heading and home link", async ({ page }) => {
    const slug = `e2e-ghost-${Date.now()}`;
    await page.goto(`/${slug}`);
    await expect(page.locator("h1")).toContainText("404", { timeout: 10_000 });
    const homeLink = page.getByRole("link", { name: "返回首页" });
    await expect(homeLink).toBeVisible({ timeout: 10_000 });
    await expect(homeLink).toHaveAttribute("href", "/");
  });
});
