import { expect, test } from "./fixtures";

test("global create opens the link dialog and escape closes it", async ({ page }) => {
  await page.goto("/dashboard");
  const fab = page.getByTestId("global-create");
  await expect(fab).toHaveCount(1);
  await fab.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("原始链接")).toBeVisible();
  await expect(dialog).toContainText("创建短链接");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("global creation follows page navigation and contextual dialogs", async ({ page }) => {
  await page.goto("/dashboard/ideas");
  const fab = page.getByTestId("global-create");
  await expect(fab).toHaveAccessibleName("新想法");
  await fab.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('a[href="/dashboard"]').first().click();
  await expect(fab).toHaveAccessibleName("新建链接");
  await fab.click();
  await expect(page.getByLabel("原始链接")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/dashboard/tags");
  await expect(fab).toHaveAccessibleName("新建标签");
  await fab.click();
  await expect(page.getByLabel("新标签名")).toBeVisible();
  await page.getByLabel("新标签名").press("Escape");

  await page.goto("/dashboard/todos");
  await expect(fab).toHaveAccessibleName("新建待办");
  await page.goto("/dashboard/uploads");
  await expect(fab).toHaveAccessibleName("上传文件");
  const chooser = page.waitForEvent("filechooser");
  await fab.click();
  expect((await chooser).isMultiple()).toBe(true);
});
