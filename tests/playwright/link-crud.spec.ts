/**
 * E2E: Link CRUD — create, view, edit, and delete links.
 *
 * Tests run against the real D1 database. The global-setup ensures
 * the E2E test user exists. Each test creates its own data and
 * the global-teardown cleans everything up.
 */
import { expect, test } from "./fixtures";
import { cardAction } from "./helpers/card-actions";
import { executeD1, TEST_USER } from "./helpers/d1";

/** Helper: wait for link-crud page to finish loading inside <main>. */
async function waitForLinksPage(page: import("@playwright/test").Page): Promise<void> {
  // Wait for the refresh button (unique, always present in links header)
  await page.locator("main").getByRole("button", { name: "刷新链接" }).waitFor({ timeout: 15_000 });
}

test.describe("Link CRUD", () => {
  test.describe("header UI", () => {
    test("shows links list with one global create button", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForLinksPage(page);

      const main = page.locator("main");
      await expect(main.getByRole("button", { name: "新建链接", exact: true })).toBeVisible();
      await expect(main.getByRole("button", { name: "刷新链接" })).toBeVisible();
      await expect(main.getByRole("button", { name: "List view" })).toBeVisible();
      await expect(main.getByRole("button", { name: "Grid view" })).toBeVisible();
    });
  });

  test.describe("create link", () => {
    test("create link in simple mode", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForLinksPage(page);

      const main = page.locator("main");

      // Open create dialog — use .first() because empty-state also has this button
      await main.getByRole("button", { name: "新建链接", exact: true }).click();
      await expect(page.getByText("创建短链接")).toBeVisible();

      // Simple mode should be selected by default
      await expect(page.locator('button:has-text("简单模式")')).toBeVisible();

      // Enter URL
      await page.locator("#url").fill("https://playwright.dev/docs/intro");

      // Submit
      await page.locator('button:has-text("创建链接")').click();

      // Wait for dialog to close (link created)
      await expect(page.getByText("创建短链接")).toBeHidden({ timeout: 15_000 });

      // Verify the link appears in the list (title may be enriched metadata or hostname fallback)
      // Use .first() because previous test runs may leave duplicate links
      await expect(
        page
          .locator('[data-testid="link-card"] a[href="https://playwright.dev/docs/intro"]')
          .first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("create link with custom slug", async ({ page }) => {
      const customSlug = `e2e-custom-${Date.now()}`;

      await page.goto("/dashboard");
      await waitForLinksPage(page);

      const main = page.locator("main");

      // Open create dialog
      await main.getByRole("button", { name: "新建链接", exact: true }).click();

      // Switch to custom slug mode
      await page.locator('button:has-text("自定义 slug")').click();

      // Enter URL and custom slug
      await page.locator("#url").fill("https://example.com/custom-test");
      await page.locator("#slug").fill(customSlug);

      // Submit
      await page.locator('button:has-text("创建链接")').click();

      // Wait for dialog to close
      await expect(page.getByText("创建短链接")).toBeHidden({ timeout: 15_000 });

      // Verify the link with custom slug appears
      await expect(page.getByRole("link", { name: `/${customSlug}`, exact: true })).toBeVisible({
        timeout: 10_000,
      });
    });

    test("create link with folder, note, and tags", async ({ page }) => {
      const folderId = `e2e-folder-${Date.now()}`;
      const folderName = `e2e-create-folder-${Date.now()}`;
      const tagName = `e2e-tag-${Date.now()}`;

      try {
        // Seed a folder via D1 so the folder selector appears in the modal
        await executeD1("INSERT INTO folders (id, user_id, name, created_at) VALUES (?, ?, ?, ?)", [
          folderId,
          TEST_USER.id,
          folderName,
          Date.now(),
        ]);

        await page.goto("/dashboard");
        await waitForLinksPage(page);

        const main = page.locator("main");

        // Open create dialog
        await main.getByRole("button", { name: "新建链接", exact: true }).click();
        await expect(page.getByText("创建短链接")).toBeVisible();

        // Fill URL
        await page.locator("#url").fill("https://example.com/folder-note-tag-test");

        // Select folder
        await page.locator("#folder").click();
        await page.getByRole("option", { name: folderName }).click();

        // Fill note
        await page.locator("#note").fill("E2E test note with folder");

        // Fill screenshot URL
        await page.locator("#screenshotUrl").fill("https://example.com/screenshot.png");

        // Create a tag via TagPicker
        await page.locator('[data-testid="tag-picker-trigger"]').click();
        await page.locator("[cmdk-input]").fill(tagName);
        await page.locator('[data-testid="tag-create-option"]').click();

        // Submit
        await page.locator('button:has-text("创建链接")').click();
        await expect(page.getByText("创建短链接")).toBeHidden({ timeout: 15_000 });

        // Verify the link appears
        await expect(
          page
            .locator('[data-testid="link-card"] a[href="https://example.com/folder-note-tag-test"]')
            .first(),
        ).toBeVisible({ timeout: 10_000 });
      } finally {
        // Cleanup folder (cascade will handle links with that folder_id)
        await executeD1(
          "DELETE FROM folders WHERE id = ? AND user_id = ?",
          [folderId, TEST_USER.id],
          { softFail: true },
        );
        // Cleanup tag
        await executeD1(
          "DELETE FROM tags WHERE user_id = ? AND name = ?",
          [TEST_USER.id, tagName],
          { softFail: true },
        );
      }
    });
  });

  test.describe("view and interact with links", () => {
    test.describe.configure({ mode: "parallel" });
    let testSlug: string;

    test.beforeEach(async ({ page }) => {
      testSlug = `e2e-view-${Date.now()}`;
      await page.goto("/dashboard");
      await waitForLinksPage(page);

      const main = page.locator("main");

      // Create a link via UI
      await main.getByRole("button", { name: "新建链接", exact: true }).click();
      await page.locator('button:has-text("自定义 slug")').click();
      await page.locator("#url").fill("https://github.com/microsoft/playwright");
      await page.locator("#slug").fill(testSlug);
      await page.locator('button:has-text("创建链接")').click();
      await expect(page.getByText("创建短链接")).toBeHidden({ timeout: 15_000 });
      await expect(page.getByRole("link", { name: `/${testSlug}`, exact: true })).toBeVisible({
        timeout: 10_000,
      });
    });

    test("copy short link", async ({ page }) => {
      // Locate the link-card that contains our slug
      const card = page.locator(`[data-testid="link-card"]:has-text("${testSlug}")`).first();
      const copyButton = card
        .locator("[data-bookmark-actions]")
        .getByRole("button", { name: "复制链接", exact: true });

      // Grant clipboard permissions
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

      await copyButton.click();
      await page.getByRole("menuitem", { name: "复制短链接", exact: true }).click();

      const shortLink = card
        .locator("[data-bookmark-links]")
        .getByRole("link", { name: `/${testSlug}`, exact: true });
      const href = await shortLink.getAttribute("href");
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(href);
    });

    test("toggle view mode between list and grid", async ({ page }) => {
      const main = page.locator("main");
      const gridButton = main.getByRole("button", { name: "Grid view" });
      const listButton = main.getByRole("button", { name: "List view" });

      // Switch to grid
      const card = page.getByTestId("link-card").filter({ hasText: `/${testSlug}` });
      await gridButton.click();
      await expect(card).toHaveAttribute("data-view", "grid");
      expect(await card.evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(
        384,
        2,
      );
      await expect(card.locator("[data-bookmark-footer] time")).toHaveCount(1);

      await listButton.click();
      await expect(card).toHaveAttribute("data-view", "list");
      const footer = card.locator("[data-bookmark-footer]");
      const classification = await footer.locator("[data-bookmark-classification]").boundingBox();
      const actions = await footer.locator("[data-bookmark-action-row]").boundingBox();
      expect(classification).not.toBeNull();
      expect(actions).not.toBeNull();
      expect((classification?.y ?? 0) + (classification?.height ?? 0) / 2).toBeCloseTo(
        (actions?.y ?? 0) + (actions?.height ?? 0) / 2,
        0,
      );
      expect(await card.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
        384,
      );
    });

    test("edit link", async ({ page }) => {
      // Locate the link-card that contains our slug
      const card = page.locator(`[data-testid="link-card"]:has-text("${testSlug}")`).first();
      await (await cardAction(page, card, "修改收藏")).click();

      const editor = page.getByTestId("card-edit-dialog");
      await expect(editor).toHaveAttribute("data-phase", "editing");
      const noteInput = editor.locator('textarea[id^="edit-note-"]');
      await expect(noteInput).toBeVisible({ timeout: 5_000 });

      // Modify the note
      await noteInput.fill("E2E test note");

      // Save
      await editor.getByRole("button", { name: "保存", exact: true }).click();

      // Edit area should collapse after save (note input hidden)
      await expect(noteInput).toBeHidden({ timeout: 10_000 });
    });

    test("edit link slug", async ({ page }) => {
      const newSlug = `e2e-edited-${Date.now()}`;
      const card = page.locator(`[data-testid="link-card"]:has-text("${testSlug}")`).first();

      await (await cardAction(page, card, "修改收藏")).click();

      // Clear and fill slug input
      const editor = page.getByTestId("card-edit-dialog");
      await expect(editor).toHaveAttribute("data-phase", "editing");
      const slugInput = editor.locator('input[id^="edit-slug-"]');
      await expect(slugInput).toBeVisible({ timeout: 5_000 });
      await slugInput.clear();
      await slugInput.fill(newSlug);

      // Save
      await editor.getByRole("button", { name: "保存", exact: true }).click();
      await expect(slugInput).toBeHidden({ timeout: 10_000 });

      // Verify new slug visible, old slug gone
      await expect(page.getByRole("link", { name: `/${newSlug}`, exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole("link", { name: `/${testSlug}`, exact: true })).toBeHidden();
    });

    test("move link to folder via edit mode", async ({ page }) => {
      const folderId = `e2e-mv-folder-${Date.now()}`;
      const folderName = `e2e-mv-${Date.now()}`;

      try {
        // Seed a folder via D1
        await executeD1("INSERT INTO folders (id, user_id, name, created_at) VALUES (?, ?, ?, ?)", [
          folderId,
          TEST_USER.id,
          folderName,
          Date.now(),
        ]);

        // Reload to pick up the new folder
        await page.goto("/dashboard");
        await waitForLinksPage(page);
        await expect(page.getByRole("link", { name: `/${testSlug}`, exact: true })).toBeVisible({
          timeout: 10_000,
        });

        const card = page.locator(`[data-testid="link-card"]:has-text("${testSlug}")`).first();

        await (await cardAction(page, card, "修改收藏")).click();

        // Select folder
        const editor = page.getByTestId("card-edit-dialog");
        await expect(editor).toHaveAttribute("data-phase", "editing");
        const folderTrigger = editor.locator('[id^="edit-folder-"]');
        await expect(folderTrigger).toBeVisible({ timeout: 5_000 });
        await folderTrigger.click();
        await page.getByRole("option", { name: folderName }).click();

        // Save
        await editor.getByRole("button", { name: "保存", exact: true }).click();
        await expect(folderTrigger).toBeHidden({ timeout: 10_000 });

        // Navigate to the folder via sidebar
        const sidebar = page.locator("aside");
        const sidebarTrigger = page.locator('button[data-sidebar="trigger"]').first();
        if (await sidebarTrigger.isVisible()) {
          const sidebarEl = sidebar.first();
          const state = await sidebarEl.getAttribute("data-state");
          if (state === "collapsed") {
            await sidebarTrigger.click();
            await page.waitForTimeout(300);
          }
        }
        await sidebar.getByText(folderName).click();
        await expect(page).toHaveURL(/folder=/, { timeout: 15_000 });

        await expect(page.getByRole("link", { name: `/${testSlug}`, exact: true })).toBeVisible({
          timeout: 10_000,
        });
      } finally {
        await executeD1(
          "DELETE FROM folders WHERE id = ? AND user_id = ?",
          [folderId, TEST_USER.id],
          { softFail: true },
        );
      }
    });

    test("delete link", async ({ page }) => {
      // Locate the link-card that contains our slug
      const card = page.locator(`[data-testid="link-card"]:has-text("${testSlug}")`).first();

      await (await cardAction(page, card, "删除收藏")).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByRole("heading", { name: "删除收藏？" })).toBeVisible();
      await expect(dialog).toContainText("此操作不可撤销");
      await expect(page.getByTestId("card-edit-dialog")).not.toBeAttached();
      await dialog.getByRole("button", { name: "删除", exact: true }).click();

      // Link should disappear
      await expect(card).not.toBeAttached({ timeout: 10_000 });
    });
  });

  test.describe("refresh links", () => {
    test("refresh button reloads data", async ({ page }) => {
      await page.goto("/dashboard");
      await waitForLinksPage(page);

      const main = page.locator("main");

      // Click refresh
      await main.getByRole("button", { name: "刷新链接" }).click();

      // Verify page still shows the links header (scoped to main)
      await expect(main.getByText("全部链接")).toBeVisible();
    });
  });
});
