import { expect, test } from "./fixtures";
import { appTitle } from "./helpers/chrome";

test.describe("Dashboard navigation", () => {
  test("sidebar navigates across core pages", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.locator("aside");
    await expect(page.locator("text=ZHE.TO")).toBeVisible();

    await sidebar.getByRole("link", { name: "概览", exact: true }).click();
    await page.waitForURL("**/dashboard/overview");
    await expect(appTitle(page, "概览")).toBeVisible();

    await sidebar.getByRole("link", { name: "标签", exact: true }).click();
    await page.waitForURL("**/dashboard/tags");

    await sidebar.locator('a:has-text("全部链接")').click();
    await page.waitForURL("**/dashboard");
    await expect(appTitle(page, "全部链接")).toBeVisible();
  });

  test("Cmd+K opens search dialog and Cmd+J opens global create", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "切换主题" })).toBeVisible();
    const searchInput = page.getByPlaceholder("搜索标题、备注、正文、README…");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(searchInput).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(searchInput).toBeHidden();
    await page.keyboard.press("ControlOrMeta+j");
    const input = page.getByLabel("原始链接");
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(input).toBeHidden();
  });
});
