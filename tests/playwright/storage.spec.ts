/**
 * E2E: Storage management — scan R2 and D1, view files, sort controls.
 *
 * The storage page (/dashboard/storage) scans real R2 and D1 and displays
 * summary cards, D1 table stats, and an R2 file list. Since this E2E runs
 * against the live environment, we cannot guarantee specific file content,
 * but we can verify the page structure and interactive controls.
 *
 * Orphan file selection and deletion are not tested here because they
 * depend on the actual R2 state and could be destructive.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const STORAGE_URL = '/dashboard/storage';

/** Navigate to storage page and wait for scan results to load. */
async function goToStorage(page: Page): Promise<void> {
  await page.goto(STORAGE_URL);
  // Wait for the skeleton to disappear and summary cards to render.
  // Scope to main to avoid matching any hidden responsive duplicates.
  await page.locator('main').getByText('R2 总存储', { exact: true }).waitFor({ timeout: 30_000 });
}

test.describe('Storage Management', () => {
  test('page renders with summary cards after scan', async ({ page }) => {
    await goToStorage(page);

    // 4 summary cards (scoped to main to avoid sidebar/responsive duplicates)
    const main = page.locator('main');
    await expect(main.getByText('R2 总存储', { exact: true })).toBeVisible();
    await expect(main.getByText('D1 数据库', { exact: true })).toBeVisible();
    await expect(main.getByText('孤儿文件', { exact: true })).toBeVisible();
    await expect(main.getByText('状态', { exact: true })).toBeVisible();

    // R2 storage sub-text shows file count
    await expect(page.getByText(/个文件/)).toBeVisible();
  });

  test('D1 section shows connected badge and table list', async ({ page }) => {
    await goToStorage(page);

    // D1 header with badge
    await expect(page.getByText('Cloudflare D1')).toBeVisible();
    await expect(page.getByText('connected').first()).toBeVisible();

    // D1 table headers
    await expect(page.getByText('Table')).toBeVisible();
    await expect(page.getByText('Rows')).toBeVisible();

    // Known D1 tables should appear
    await expect(page.getByText('links')).toBeVisible();
    await expect(page.getByText('uploads')).toBeVisible();
  });

  test('R2 section shows connected badge', async ({ page }) => {
    await goToStorage(page);

    // R2 header with badge
    await expect(page.getByText('Cloudflare R2')).toBeVisible();
    // At least one "connected" badge (D1 and/or R2)
    const connectedBadges = page.getByText('connected');
    await expect(connectedBadges.first()).toBeVisible();
  });

  test('rescan button triggers a new scan', async ({ page }) => {
    await goToStorage(page);

    const rescanBtn = page.getByRole('button', { name: '重新扫描' });
    await expect(rescanBtn).toBeVisible();

    // Click rescan — button should become disabled briefly while scanning
    await rescanBtn.click();

    // After scan completes, summary cards should still be visible
    await page.locator('main').getByText('R2 总存储', { exact: true }).waitFor({ timeout: 30_000 });
    await expect(rescanBtn).toBeEnabled();
  });

  test('sort controls for R2 files are functional', async ({ page }) => {
    await goToStorage(page);

    // Sort buttons
    const timeBtn = page.getByRole('button', { name: /时间/ });
    const sizeBtn = page.getByRole('button', { name: /大小/ });

    await expect(timeBtn).toBeVisible();
    await expect(sizeBtn).toBeVisible();

    // Click size to sort by size
    await sizeBtn.click();

    // Click size again to toggle direction
    await sizeBtn.click();

    // Switch back to time sort
    await timeBtn.click();

    // No crash, page still shows data
    await expect(page.locator('main').getByText('R2 总存储', { exact: true })).toBeVisible();
  });

  test('D1 database card shows connection status', async ({ page }) => {
    await goToStorage(page);

    // The D1 summary card should show "已连接"
    await expect(page.getByText('已连接')).toBeVisible();
  });
});
