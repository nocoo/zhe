import { expect, test } from "./fixtures/owner";
import { executeD1 } from "./helpers/d1";
import { attachOverlayEvidence } from "./helpers/overlay-evidence";

test.beforeEach(async ({ owner }) => {
  const now = Date.now();
  for (const start of [0, 14]) {
    const rows = Array.from({ length: 14 }, (_, offset) => {
      const index = start + offset;
      return [
        owner,
        `${owner}-${index}`,
        `https://example.com/overlay/${index}`,
        `Overlay fixture ${index}`,
        now + index,
      ];
    });
    await executeD1(
      `INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES ${rows.map(() => "(?,?,?,?,?)").join(",")}`,
      rows.flat(),
    );
  }
});

test("one global creation entry focuses URL and restores keyboard focus at iPhone widths", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const fab = page.getByTestId("global-create");
  for (const width of [320, 375, 390, 430, 1365]) {
    await page.setViewportSize({ width, height: 932 });
    await expect(fab).toHaveCount(1);
    await expect(page.getByRole("button", { name: "新建链接", exact: true })).toHaveCount(1);
    const box = await fab.boundingBox();
    if (!box) throw new Error("Creation FAB is not visible");
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThan(width);
    expect(box.y + box.height).toBeLessThan(932);
    await fab.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("原始链接")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog).toContainText("创建短链接");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    try {
      await expect(dialog).toBeHidden();
    } catch (error) {
      await attachOverlayEvidence(page, test.info());
      throw error;
    }
    await expect(fab).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fab.click();
  await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "none");
});

test("global creation follows page navigation and returns from contextual dialogs", async ({
  page,
}) => {
  await page.goto("/dashboard/ideas");
  const fab = page.getByTestId("global-create");
  await expect(fab).toHaveAccessibleName("新想法");
  await expect(page.getByRole("button", { name: "新想法", exact: true })).toHaveCount(1);
  await fab.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fab).toBeFocused();

  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('a[href="/dashboard"]').first().click();
  await expect(fab).toHaveAccessibleName("新建链接");
  await fab.click();
  await expect(page.getByLabel("原始链接")).toBeFocused();
  await page.keyboard.press("Escape");

  await page.goto("/dashboard/tags");
  await expect(fab).toHaveAccessibleName("新建标签");
  await fab.click();
  await expect(page.getByLabel("新标签名")).toBeFocused();
  await page.getByLabel("新标签名").press("Escape");
  await expect(fab).toBeEnabled();

  await page.goto("/dashboard/todos");
  await expect(fab).toHaveAccessibleName("新建待办");
  await page.goto("/dashboard/uploads");
  await expect(fab).toHaveAccessibleName("上传文件");
  const chooser = page.waitForEvent("filechooser");
  await fab.click();
  expect((await chooser).isMultiple()).toBe(true);
});
