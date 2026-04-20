/**
 * E2E: Upload UI — file upload via browser, delete, copy link, PNG convert toggle.
 *
 * The upload flow involves presigned R2 URLs. To avoid actual R2 uploads and
 * orphan objects, we intercept PUT requests to *.r2.cloudflarestorage.com and
 * return a mock 200 response. The D1 record flow (via server actions) runs
 * against the real database.
 *
 * Tests run serially; global-teardown cleans up uploads for the test user.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { executeD1, TEST_USER } from './helpers/d1';

const UPLOADS_URL = '/dashboard/uploads';

/**
 * Intercept R2 presigned-URL PUT requests and return 200.
 * This prevents actual file uploads to R2 while letting the server-action
 * flow (getPresignedUploadUrl → recordUpload) work against real D1.
 */
async function interceptR2Puts(page: Page): Promise<void> {
  await page.route('**/*r2.cloudflarestorage.com/**', (route) => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({ status: 200, body: '' });
    }
    return route.continue();
  });
}

/** Navigate to uploads page and wait for it to be ready. */
async function goToUploads(page: Page): Promise<void> {
  await page.goto(UPLOADS_URL);
  // Wait for the upload zone to confirm page is hydrated
  await page.locator('[data-testid="upload-zone"]').first().waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe.serial('Upload UI', () => {
  // Ensure clean state: no leftover uploads from other specs (e.g. overview seeds uploads)
  test.beforeAll(async () => {
    await executeD1('DELETE FROM uploads WHERE user_id = ?', [TEST_USER.id], { softFail: true });
  });

  test('page renders with header, upload zone, and empty state', async ({ page }) => {
    await goToUploads(page);

    // Header
    await expect(page.getByRole('heading', { name: '文件上传' })).toBeVisible();
    await expect(page.locator('[data-testid="upload-file-count"]').first()).toContainText('共');

    // Upload zone — use .first() to be resilient to brief double-mount during
    // client-side navigation (React 18 dev StrictMode + Next router transition
    // can momentarily render two instances of the page tree).
    await expect(page.locator('[data-testid="upload-zone"]').first()).toBeVisible();
    await expect(page.getByText('拖拽文件到此处，或点击选择').first()).toBeVisible();
    await expect(page.getByText('支持所有文件类型，最大 10MB').first()).toBeVisible();

    // Empty state (no uploads yet for test user after global teardown)
    await expect(page.locator('[data-testid="upload-empty-state"]').first()).toBeVisible();
    await expect(page.getByText('暂无文件').first()).toBeVisible();
  });

  test('upload a file via file input', async ({ page }) => {
    await interceptR2Puts(page);
    await goToUploads(page);

    // Upload a small text file
    const fileInput = page.locator('[data-testid="upload-input"]').first();
    await fileInput.setInputFiles({
      name: 'e2e-test-file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Hello from Playwright E2E test'),
    });

    // The uploading item should appear briefly, then the completed item
    // Wait for the completed upload item to appear (longer timeout for CI cold-compile)
    await expect(page.locator('[data-testid="upload-item"]')).toBeVisible({ timeout: 30_000 });

    // Verify file name is displayed
    await expect(page.locator('[data-testid="upload-file-name"]').first()).toContainText('e2e-test-file.txt');

    // File count should update
    await expect(page.locator('[data-testid="upload-file-count"]')).toContainText('共 1 个文件');

    // Empty state should be gone
    await expect(page.locator('[data-testid="upload-empty-state"]').first()).not.toBeVisible();
  });

  test('upload a second file and verify ordering (newest first)', async ({ page }) => {
    await interceptR2Puts(page);
    await goToUploads(page);

    // Wait for existing uploads to load
    await expect(page.locator('[data-testid="upload-item"]')).toHaveCount(1, { timeout: 15_000 });

    // Upload another file
    const fileInput = page.locator('[data-testid="upload-input"]').first();
    await fileInput.setInputFiles({
      name: 'e2e-test-file-2.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Second file from Playwright'),
    });

    // Wait for two items
    await expect(page.locator('[data-testid="upload-item"]')).toHaveCount(2, { timeout: 15_000 });

    // Newest file should be first
    const fileNames = page.locator('[data-testid="upload-file-name"]');
    await expect(fileNames.first()).toContainText('e2e-test-file-2.txt');
    await expect(fileNames.last()).toContainText('e2e-test-file.txt');

    // File count should update
    await expect(page.locator('[data-testid="upload-file-count"]')).toContainText('共 2 个文件');
  });

  test('copy link shows check icon', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await goToUploads(page);

    // Wait for uploads to load
    await expect(page.locator('[data-testid="upload-item"]').first()).toBeVisible({ timeout: 15_000 });

    // Click the copy button on the first item
    const firstItem = page.locator('[data-testid="upload-item"]').first();
    await firstItem.getByRole('button', { name: 'Copy link' }).click();

    // The check icon should appear (svg with class text-success)
    await expect(firstItem.locator('.text-success')).toBeVisible({ timeout: 3_000 });
  });

  test('external link has correct target and href', async ({ page }) => {
    await goToUploads(page);

    await expect(page.locator('[data-testid="upload-item"]').first()).toBeVisible({ timeout: 15_000 });

    // The "在新标签页打开" link should have target="_blank"
    const firstItem = page.locator('[data-testid="upload-item"]').first();
    const externalLink = firstItem.locator('a[title="在新标签页打开"]');
    await expect(externalLink).toHaveAttribute('target', '_blank');
    const href = await externalLink.getAttribute('href');
    expect(href).toBeTruthy();
    if (!href) throw new Error('expected href to be non-null');
    expect(href.startsWith('http')).toBe(true);
  });

  test('delete an upload via confirmation dialog', async ({ page }) => {
    await goToUploads(page);

    // Wait for two items
    await expect(page.locator('[data-testid="upload-item"]')).toHaveCount(2, { timeout: 15_000 });

    // Click delete on the first item (newest)
    const firstItem = page.locator('[data-testid="upload-item"]').first();
    await firstItem.getByRole('button', { name: 'Delete file' }).click();

    // AlertDialog should appear
    await expect(page.getByText('确认删除')).toBeVisible();
    await expect(page.getByText('此操作不可撤销，确定要删除这个文件吗？')).toBeVisible();

    // Click confirm
    await page.locator('[data-testid="upload-delete-confirm"]').click();

    // Item should disappear, count should update
    await expect(page.locator('[data-testid="upload-item"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('[data-testid="upload-file-count"]')).toContainText('共 1 个文件');
  });

  test('cancel delete keeps the item', async ({ page }) => {
    await goToUploads(page);

    await expect(page.locator('[data-testid="upload-item"]')).toHaveCount(1, { timeout: 15_000 });

    // Click delete
    const firstItem = page.locator('[data-testid="upload-item"]').first();
    await firstItem.getByRole('button', { name: 'Delete file' }).click();

    // Click cancel
    await page.getByRole('button', { name: '取消' }).click();

    // Item should still be there
    await expect(page.locator('[data-testid="upload-item"]')).toHaveCount(1);
  });

  test('PNG auto-convert toggle shows/hides quality slider', async ({ page }) => {
    await goToUploads(page);

    const pngSwitch = page.locator('[data-testid="png-convert-switch"]').first();

    // Initially off — quality slider should not be visible
    const qualityLabel = page.getByText('质量', { exact: true });

    // Turn on
    await pngSwitch.click();
    await expect(qualityLabel).toBeVisible({ timeout: 3_000 });
    await expect(page.getByLabel('JPG 质量')).toBeVisible();

    // Turn off
    await pngSwitch.click();
    await expect(qualityLabel).not.toBeVisible();
  });

  test('PNG convert toggle persists across page reload', async ({ page }) => {
    await goToUploads(page);

    const pngSwitch = page.locator('[data-testid="png-convert-switch"]').first();

    // Turn on
    await pngSwitch.click();
    await expect(page.getByText('质量', { exact: true })).toBeVisible({ timeout: 3_000 });

    // Reload and wait for React hydration + localStorage read to complete
    await page.reload();
    // Wait for upload zone to appear (page is loaded)
    await page.locator('[data-testid="upload-zone"]').first().waitFor({ state: 'visible', timeout: 15_000 });
    // Wait for "质量" label to appear — confirms localStorage was read and
    // autoConvertPng state was rehydrated.
    await expect(page.getByText('质量', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Clean up: turn it off
    await page.locator('[data-testid="png-convert-switch"]').first().click();
    await expect(page.getByText('质量', { exact: true })).not.toBeVisible();
  });

  test('cleanup: delete remaining test uploads', async ({ page }) => {
    // The other specs (notably overview.spec.ts) seed extra uploads in a
    // parallel worker (workers > 1). To avoid a UI race where a freshly
    // seeded upload-item briefly exposes a disabled delete button, do the
    // bulk cleanup at the DB level, then assert the UI converges to the
    // empty state.
    await executeD1(
      'DELETE FROM uploads WHERE user_id = ?',
      [TEST_USER.id],
      { softFail: true },
    );

    await goToUploads(page);

    // Page may take a moment to fetch fresh data after a server-side delete.
    await expect(page.locator('[data-testid="upload-empty-state"]').first()).toBeVisible({ timeout: 15_000 });
  });
});
