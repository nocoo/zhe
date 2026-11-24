import { expect, test } from "./fixtures";
import { executeD1, TEST_USER } from "./helpers/d1";

test.describe("404 page and link expiration", () => {
  test("non-existent slug shows 404 heading and home link", async ({ page }) => {
    const slug = `e2e-ghost-${Date.now()}`;
    await page.goto(`/${slug}`);
    await expect(page.locator("h1")).toContainText("404", { timeout: 10_000 });
    const homeLink = page.getByRole("link", { name: "返回首页" });
    await expect(homeLink).toBeVisible({ timeout: 10_000 });
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("expired link shows 404 page instead of redirecting", async ({ page }) => {
    const slug = `e2e-expired-${Date.now()}`;
    const pastTimestamp = Date.now() - 3_600_000;
    await executeD1(
      `INSERT INTO links (user_id, original_url, slug, is_custom, expires_at, clicks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [TEST_USER.id, "https://example.com/should-not-reach", slug, 0, pastTimestamp, 0, Date.now()],
    );
    await page.goto(`/${slug}`);
    await expect(page.locator("h1")).toContainText("404", { timeout: 10_000 });
  });
});
