import { expect, test } from "./fixtures";

test("creation shortcut stays separate from search and preserves an open draft", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.keyboard.press("ControlOrMeta+Shift+k");
  const input = page.getByLabel("原始链接");
  await expect(input).toBeFocused();
  await input.fill("https://example.com/draft");
  await page.keyboard.press("ControlOrMeta+Shift+k");
  await expect(input).toHaveValue("https://example.com/draft");
  await expect(input).toBeFocused();
  await expect(page.getByPlaceholder("搜索标题、备注、正文、README…")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("global-create")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("搜索标题、备注、正文、README…")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+Shift+k");
  await expect(input).toBeHidden();
});

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

  await page.goto("/dashboard");
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
