/**
 * E2E: Data management — export and import links as JSON.
 *
 * Tests the /dashboard/data-management page which provides:
 * - Export all links to a JSON file download
 * - Import links from a JSON file (with created/skipped counts)
 *
 * Tests run serially; a test link is seeded for export, then cleaned up.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { executeD1, TEST_USER } from './helpers/d1';

const DATA_MGMT_URL = '/dashboard/data-management';

/** Navigate to the data management page and wait for hydration. */
async function goToDataManagement(page: Page): Promise<void> {
  await page.goto(DATA_MGMT_URL);
  await page.getByRole('heading', { name: '数据导出' }).waitFor({ timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

test.describe.serial('Data Management', () => {
  const testSlug = `dm-e2e-${Date.now()}`;

  test.beforeAll(async () => {
    // Seed a link so export has data to return
    await executeD1(
      'INSERT OR IGNORE INTO links (original_url, slug, user_id, clicks, created_at) VALUES (?, ?, ?, 0, ?)',
      ['https://example.com/data-management-test', testSlug, TEST_USER.id, Date.now()],
      { softFail: true },
    );
  });

  test.afterAll(async () => {
    await executeD1(
      'DELETE FROM links WHERE slug = ? AND user_id = ?',
      [testSlug, TEST_USER.id],
      { softFail: true },
    );
  });

  test('page renders with export and import cards', async ({ page }) => {
    await goToDataManagement(page);

    // Page heading
    await expect(page.locator('[aria-current="page"]')).toContainText('数据管理');

    // Export card
    await expect(page.getByRole('heading', { name: '数据导出' })).toBeVisible();
    await expect(page.getByText('将所有链接数据导出为 JSON 文件')).toBeVisible();
    await expect(page.getByRole('button', { name: '导出链接' })).toBeVisible();

    // Import card
    await expect(page.getByRole('heading', { name: '数据导入' })).toBeVisible();
    await expect(page.getByText('从 JSON 文件导入链接数据')).toBeVisible();
    await expect(page.locator('[data-testid="import-file-input"]')).toBeVisible();
  });

  test('export triggers a JSON file download', async ({ page }) => {
    await goToDataManagement(page);

    // Listen for download event
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });

    // Click export
    await page.getByRole('button', { name: '导出链接' }).click();

    // Verify download happened
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^zhe-links-\d{4}-\d{2}-\d{2}\.json$/);

    // Read the file and verify it contains our seeded link
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test('import a JSON file and show result', async ({ page }) => {
    await goToDataManagement(page);

    const importSlug = `dm-import-${Date.now()}`;

    // Create a valid import JSON
    const importData = [
      {
        originalUrl: 'https://example.com/imported',
        slug: importSlug,
        createdAt: new Date().toISOString(),
      },
    ];

    // Set the file on the input
    const fileInput = page.locator('[data-testid="import-file-input"]');
    await fileInput.setInputFiles({
      name: 'test-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importData)),
    });

    // Wait for import result to appear
    await expect(page.getByText('导入完成')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('成功')).toBeVisible();

    // OK button dismisses the result
    await page.getByRole('button', { name: '确定' }).click();

    // After dismissing, file input should be visible again
    await expect(page.locator('[data-testid="import-file-input"]')).toBeVisible();

    // Clean up the imported link
    await executeD1(
      'DELETE FROM links WHERE slug = ? AND user_id = ?',
      [importSlug, TEST_USER.id],
      { softFail: true },
    );
  });

  test('import with duplicate slug shows skipped count', async ({ page }) => {
    await goToDataManagement(page);

    // Import the same slug that already exists (seeded in beforeAll)
    const importData = [
      {
        originalUrl: 'https://example.com/duplicate',
        slug: testSlug,
        createdAt: new Date().toISOString(),
      },
    ];

    const fileInput = page.locator('[data-testid="import-file-input"]');
    await fileInput.setInputFiles({
      name: 'test-duplicate.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importData)),
    });

    // Wait for result — should show skipped count in result text
    // "导入完成：成功 X 条，跳过 Y 条" — match the result pattern to avoid
    // collision with description text "已存在的短链接将被自动跳过"
    await expect(page.getByText('导入完成')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/跳过\s+\d+\s+条/)).toBeVisible();

    // Dismiss
    await page.getByRole('button', { name: '确定' }).click();
  });
});
