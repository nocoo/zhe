/**
 * E2E: Settings tags page — create, recolor, rename, delete.
 */
import { expect, test } from "./fixtures";

test.describe("Tags management", () => {
  test.describe.configure({ timeout: 60_000 });

  test("create, recolor, rename, and delete a tag", async ({ page }) => {
    const name = `mgmt-${Date.now()}`;
    const renamed = `${name}-renamed`;

    await page.goto("/dashboard/tags");
    await expect(page.locator('[data-testid="tags-page"]')).toBeVisible();

    await page.locator('[data-testid="tag-create-btn"]').click();
    await expect(page.locator('[data-testid="tag-create-form"]')).toBeVisible();
    await page.getByLabel("新标签名").fill(name);
    await page.locator('[data-testid="tag-color-red"]').click();
    await page.locator('[data-testid="tag-create-submit"]').click();

    const created = page.locator(`[data-testid="tag-manage-row"]:has([data-tag-name="${name}"])`);
    await expect(created).toBeVisible({ timeout: 15_000 });
    const tagId = await created.getAttribute("data-tag-id");
    expect(tagId).toBeTruthy();
    const row = page.locator(`[data-testid="tag-manage-row"][data-tag-id="${tagId}"]`);
    await expect(row.locator('[data-testid="tag-usage"]')).toHaveText("未使用");

    await row.locator('[data-testid="tag-color-green"]').click();
    await expect(row.locator('[data-testid="tag-color-green"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const renameInput = row.getByLabel(`重命名 ${name}`);
    await renameInput.fill(renamed);
    await renameInput.blur();
    await expect(row.locator(`[data-tag-name="${renamed}"]`)).toBeVisible({ timeout: 10_000 });

    await row.locator('[data-testid="tag-delete-btn"]').click();
    await page.getByRole("button", { name: "删除" }).click();
    await expect(
      page.locator(`[data-testid="tag-manage-row"][data-tag-id="${tagId}"]`),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});
