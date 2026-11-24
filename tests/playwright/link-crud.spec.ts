import { expect, test } from "./fixtures";
import { cardAction } from "./helpers/card-actions";
import { executeD1, TEST_USER } from "./helpers/d1";

async function waitForLinksPage(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("main").getByRole("button", { name: "刷新链接" }).waitFor({ timeout: 15_000 });
}

test.describe("Link CRUD", () => {
  test("creates, edits, and deletes a link", async ({ page }) => {
    const slug = `e2e-crud-${Date.now()}`;
    await page.goto("/dashboard");
    await waitForLinksPage(page);

    const main = page.locator("main");
    await main.getByRole("button", { name: "新建链接", exact: true }).click();
    await page.locator('button:has-text("自定义 slug")').click();
    await page.locator("#url").fill("https://example.com/e2e-crud");
    await page.locator("#slug").fill(slug);
    await page.locator('button:has-text("创建链接")').click();
    await expect(page.getByText("创建短链接")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: `/${slug}`, exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const card = page.locator(`[data-testid="link-card"]:has-text("${slug}")`).first();
    await (await cardAction(page, card, "修改收藏")).click();
    const editor = page.getByTestId("card-edit-dialog");
    await expect(editor).toHaveAttribute("data-phase", "editing");
    const noteInput = editor.locator('textarea[id^="edit-note-"]');
    await expect(noteInput).toBeVisible({ timeout: 5_000 });
    await noteInput.fill("E2E test note");
    await editor.getByRole("button", { name: "保存", exact: true }).click();
    await expect(noteInput).toBeHidden({ timeout: 10_000 });

    await (await cardAction(page, card, "删除收藏")).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "删除", exact: true }).click();
    await expect(card).not.toBeAttached({ timeout: 10_000 });

    await executeD1("DELETE FROM links WHERE user_id = ? AND slug = ?", [TEST_USER.id, slug], {
      softFail: true,
    });
  });
});
