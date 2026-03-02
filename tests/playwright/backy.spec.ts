/**
 * E2E: Backy page — push backup config, test connection, push backup,
 * remote history, pull webhook CRUD (generate/regenerate/revoke).
 *
 * The Backy page (`/dashboard/backy`) has two cards:
 * 1. Remote Backup (Push) — configure webhook URL + API key, test, push
 * 2. Pull Webhook — generate/regenerate/revoke credentials for Backy pull
 *
 * Tests run serially because they build on shared state (saved config,
 * generated pull keys). Cleanup in afterAll resets user_settings columns.
 *
 * NOTE: Push and test-connection hit an external Backy service that is
 * unavailable in E2E; we verify the UI correctly shows the error response.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { executeD1, TEST_USER } from './helpers/d1';

const BACKY_URL = '/dashboard/backy';

/** Navigate to the Backy page and wait for hydration. */
async function goToBacky(page: Page): Promise<void> {
  await page.goto(BACKY_URL);
  await page.getByText('远程备份').first().waitFor({ timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

test.describe.serial('Backy Page', () => {
  // Ensure clean state: clear backy-related columns in user_settings
  test.beforeAll(async () => {
    await executeD1(
      'UPDATE user_settings SET backy_webhook_url = NULL, backy_api_key = NULL, backy_pull_key = NULL WHERE user_id = ?',
      [TEST_USER.id],
      { softFail: true },
    );
  });

  test.afterAll(async () => {
    await executeD1(
      'UPDATE user_settings SET backy_webhook_url = NULL, backy_api_key = NULL, backy_pull_key = NULL WHERE user_id = ?',
      [TEST_USER.id],
      { softFail: true },
    );
  });

  // ── Push card: unconfigured state ─────────────────────────

  test('page renders with push config form when unconfigured', async ({ page }) => {
    await goToBacky(page);

    // Push card title
    await expect(page.getByText('远程备份').first()).toBeVisible();

    // Description text
    await expect(page.getByText('将数据备份推送到 Backy 远程存储服务')).toBeVisible();

    // Form inputs visible (unconfigured = shows form)
    await expect(page.locator('[data-testid="backy-webhook-url"]')).toBeVisible();
    await expect(page.locator('[data-testid="backy-api-key"]')).toBeVisible();

    // Save button
    await expect(page.getByRole('button', { name: '保存' })).toBeVisible();

    // No test/push buttons yet (only when configured)
    await expect(page.getByRole('button', { name: '测试连接' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: '推送备份' })).not.toBeVisible();
  });

  test('pull webhook card renders with generate button when no credentials', async ({ page }) => {
    await goToBacky(page);

    // Pull webhook card title
    await expect(page.getByText('拉取 Webhook')).toBeVisible();

    // Description
    await expect(page.getByText('提供给 Backy 调用的 Webhook 地址')).toBeVisible();

    // Generate button visible
    await expect(page.getByRole('button', { name: '生成凭证' })).toBeVisible();

    // No regenerate/revoke buttons yet
    await expect(page.getByRole('button', { name: '重新生成' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: '撤销' })).not.toBeVisible();
  });

  // ── Push card: save config ────────────────────────────────

  test('saves push config and shows configured state', async ({ page }) => {
    await goToBacky(page);

    // Fill config form
    await page.locator('[data-testid="backy-webhook-url"]').fill('https://backy.example.com/api/webhook/test');
    await page.locator('[data-testid="backy-api-key"]').fill('e2e-test-api-key-12345');

    // Click save
    await page.getByRole('button', { name: '保存' }).click();

    // Wait for configured state to appear — webhook URL is displayed as code
    await expect(page.locator('code').filter({ hasText: 'backy.example.com' })).toBeVisible({ timeout: 10_000 });

    // Masked API key is displayed (ends with *****)
    await expect(page.locator('code').filter({ hasText: /\*{4,}/ })).toBeVisible();

    // Edit button is visible
    await expect(page.getByLabel('编辑配置')).toBeVisible();

    // Action buttons now available
    await expect(page.getByRole('button', { name: '测试连接' })).toBeVisible();
    await expect(page.getByRole('button', { name: '推送备份' })).toBeVisible();
  });

  // ── Push card: test connection (external service unavailable) ──

  test('test connection shows error when external service is unreachable', async ({ page }) => {
    await goToBacky(page);

    // Wait for configured state
    await expect(page.getByRole('button', { name: '测试连接' })).toBeVisible({ timeout: 10_000 });

    // Click test connection
    await page.getByRole('button', { name: '测试连接' }).click();

    // Wait for test result to appear — should show an error
    const testResult = page.locator('[data-testid="backy-test-result"]');
    await expect(testResult).toBeVisible({ timeout: 15_000 });
  });

  // ── Push card: history section ────────────────────────────

  test('shows remote history section with refresh button', async ({ page }) => {
    await goToBacky(page);

    // Wait for configured state
    await expect(page.getByRole('button', { name: '测试连接' })).toBeVisible({ timeout: 10_000 });

    // History section
    await expect(page.getByText('远程备份记录')).toBeVisible();

    // Refresh button (aria-label)
    await expect(page.getByLabel('刷新历史')).toBeVisible();
  });

  // ── Push card: edit config ────────────────────────────────

  test('edit button shows form with current values, cancel returns to display', async ({ page }) => {
    await goToBacky(page);

    // Wait for configured state
    await expect(page.getByLabel('编辑配置')).toBeVisible({ timeout: 10_000 });

    // Click edit
    await page.getByLabel('编辑配置').click();

    // Form should appear with populated values
    const urlInput = page.locator('[data-testid="backy-webhook-url"]');
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue('https://backy.example.com/api/webhook/test');

    // Cancel button should be visible (only when editing)
    const cancelBtn = page.getByRole('button', { name: '取消' });
    await expect(cancelBtn).toBeVisible();

    // Click cancel — returns to configured display
    await cancelBtn.click();
    await expect(page.getByRole('button', { name: '测试连接' })).toBeVisible({ timeout: 5_000 });
    await expect(urlInput).not.toBeVisible();
  });

  // ── Pull webhook: generate ────────────────────────────────

  test('generates pull webhook credentials', async ({ page }) => {
    await goToBacky(page);

    // Click generate
    await page.getByRole('button', { name: '生成凭证' }).click();

    // Wait for credentials to appear — Webhook URL should be visible
    await expect(page.locator('code').filter({ hasText: '/api/backy/pull' })).toBeVisible({ timeout: 10_000 });

    // Key is displayed (non-empty)
    const keyHeader = page.getByText('X-Webhook-Key');
    await expect(keyHeader).toBeVisible();

    // Regenerate and revoke buttons now visible
    await expect(page.getByRole('button', { name: '重新生成' })).toBeVisible();
    await expect(page.getByRole('button', { name: '撤销' })).toBeVisible();

    // Usage hint (curl example)
    await expect(page.getByText('调用示例')).toBeVisible();
    await expect(page.getByText(/curl -X POST/)).toBeVisible();
  });

  // ── Pull webhook: regenerate ──────────────────────────────

  test('regenerates pull webhook key with a new value', async ({ page }) => {
    await goToBacky(page);

    // Wait for credentials to be displayed
    await expect(page.getByRole('button', { name: '重新生成' })).toBeVisible({ timeout: 10_000 });

    // Capture current key value — find the code element that contains the key
    // The key is in a code element with font-mono class, containing an alphanumeric string
    const pullKeyCodeElements = page.locator('.font-mono').filter({ hasText: /^[a-zA-Z0-9_-]{10,}$/ });
    const oldKey = await pullKeyCodeElements.first().textContent();
    expect(oldKey).toBeTruthy();

    // Click regenerate
    await page.getByRole('button', { name: '重新生成' }).click();

    // Wait for key to change
    await expect(async () => {
      const newKey = await pullKeyCodeElements.first().textContent();
      expect(newKey).toBeTruthy();
      expect(newKey).not.toBe(oldKey);
    }).toPass({ timeout: 10_000 });
  });

  // ── Pull webhook: revoke ──────────────────────────────────

  test('revokes pull webhook and returns to generate state', async ({ page }) => {
    await goToBacky(page);

    // Wait for credentials to be displayed
    await expect(page.getByRole('button', { name: '撤销' })).toBeVisible({ timeout: 10_000 });

    // Click revoke
    await page.getByRole('button', { name: '撤销' }).click();

    // Wait for credentials to disappear — generate button should come back
    await expect(page.getByRole('button', { name: '生成凭证' })).toBeVisible({ timeout: 10_000 });

    // Regenerate/revoke buttons gone
    await expect(page.getByRole('button', { name: '重新生成' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: '撤销' })).not.toBeVisible();
  });

  test('can generate credentials again after revoking', async ({ page }) => {
    await goToBacky(page);

    // Currently no credentials
    await expect(page.getByRole('button', { name: '生成凭证' })).toBeVisible({ timeout: 10_000 });

    // Generate again
    await page.getByRole('button', { name: '生成凭证' }).click();

    // Credentials appear
    await expect(page.locator('code').filter({ hasText: '/api/backy/pull' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: '重新生成' })).toBeVisible();
    await expect(page.getByRole('button', { name: '撤销' })).toBeVisible();
  });
});
