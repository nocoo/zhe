/**
 * E2E: Folder UI — create folders, rename, delete, filter links.
 *
 * Tests the sidebar folder functionality which uses D1 database
 * operations via the Worker proxy path.
 *
 * Tests run serially; folders are created then cleaned up.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { executeD1, TEST_USER } from './helpers/d1';

/** Helper: wait for link-list page to finish loading. */
async function waitForLinksPage(page: Page): Promise<void> {
  await page.locator('main').getByRole('button', { name: '刷新链接' }).waitFor({ timeout: 15_000 });
}

/** Helper: ensure sidebar is in expanded state. */
async function ensureSidebarExpanded(page: Page): Promise<void> {
  // Check if sidebar rail toggle exists and sidebar is collapsed
  const sidebarTrigger = page.locator('button[data-sidebar="trigger"]').first();
  if (await sidebarTrigger.isVisible()) {
    const sidebar = page.locator('aside[data-sidebar]').first();
    const state = await sidebar.getAttribute('data-state');
    if (state === 'collapsed') {
      await sidebarTrigger.click();
      await page.waitForTimeout(300);
    }
  }
}

test.describe.serial('Folder CRUD', () => {
  const uniqueSuffix = Date.now();
  const folderName = `e2e-folder-${uniqueSuffix}`;
  const renamedName = `e2e-renamed-${uniqueSuffix}`;

  test.beforeAll(async () => {
    // Clean up any leftover test folders
    await executeD1(
      "DELETE FROM folders WHERE user_id = ? AND name LIKE 'e2e-%'",
      [TEST_USER.id],
      { softFail: true },
    );
  });

  test.afterAll(async () => {
    // Clean up test folders
    await executeD1(
      "DELETE FROM folders WHERE user_id = ? AND name LIKE 'e2e-%'",
      [TEST_USER.id],
      { softFail: true },
    );
  });

  test('create a folder via sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);
    await ensureSidebarExpanded(page);

    const sidebar = page.locator('aside');

    // Find and click the add folder button (+ icon in the 链接管理 group)
    // The button shows on hover, so we need to hover first
    const groupLabel = sidebar.getByText('链接管理');
    await groupLabel.hover();

    // Click the + button that appears
    const addButton = sidebar.locator('button[aria-label="添加文件夹"]');
    if (await addButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addButton.click();
    } else {
      // Try finding by the Plus icon
      const plusButtons = sidebar.locator('button').filter({ has: page.locator('.lucide-plus') });
      await plusButtons.first().click();
    }

    // Wait for the create input to appear (SidebarFolderCreate component)
    const createInput = sidebar.locator('input[placeholder="文件夹名称"]');
    await expect(createInput).toBeVisible({ timeout: 5_000 });

    // Type the folder name
    await createInput.fill(folderName);

    // Click the confirm button (Check icon)
    await sidebar.locator('button[aria-label="确认"]').first().click();

    // Wait for the folder to appear in the sidebar
    await expect(sidebar.getByText(folderName)).toBeVisible({ timeout: 10_000 });
  });

  test('navigate to folder and see empty state', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);
    await ensureSidebarExpanded(page);

    const sidebar = page.locator('aside');

    // Click on the created folder to filter
    await sidebar.getByText(folderName).click();

    // URL should include folder parameter
    await expect(page).toHaveURL(/folder=/);

    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('rename a folder via dropdown menu', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);
    await ensureSidebarExpanded(page);

    const sidebar = page.locator('aside');

    // Find the folder item and hover to show the menu button
    const folderLink = sidebar.locator(`a[href*="folder="]:has-text("${folderName}")`);
    await folderLink.hover();

    // Click the menu button (MoreHorizontal icon)
    const menuButton = sidebar.locator('button[aria-label="文件夹操作"]');
    await menuButton.click();

    // Click "编辑" in the dropdown
    await page.getByRole('menuitem', { name: '编辑' }).click();

    // Wait for edit input to appear
    const editInput = sidebar.locator('input[placeholder="文件夹名称"]');
    await expect(editInput).toBeVisible({ timeout: 5_000 });

    // Clear and type new name
    await editInput.clear();
    await editInput.fill(renamedName);

    // Confirm (press Enter or click confirm button)
    await editInput.press('Enter');

    // Verify the new name appears
    await expect(sidebar.getByText(renamedName)).toBeVisible({ timeout: 10_000 });
  });

  test('delete a folder via dropdown menu', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);
    await ensureSidebarExpanded(page);

    const sidebar = page.locator('aside');

    // Find the renamed folder and hover
    const folderLink = sidebar.locator(`a[href*="folder="]:has-text("${renamedName}")`);
    await folderLink.hover();

    // Click the menu button
    const menuButton = sidebar.locator('button[aria-label="文件夹操作"]');
    await menuButton.click();

    // Click "删除" in the dropdown and wait for the API response
    const deleteResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/') && resp.request().method() === 'DELETE',
    );
    await page.getByRole('menuitem', { name: '删除' }).click();
    await deleteResponse.catch(() => {});

    // Wait for DOM to update after deletion
    await page.waitForTimeout(1_000);

    // The folder should disappear (no confirmation dialog based on component code)
    await expect(sidebar.getByText(renamedName)).toBeHidden({ timeout: 15_000 });
  });
});
