/**
 * E2E: Xray page — API config, tweet fetching, raw JSON toggle, bookmarks.
 *
 * The Xray page (`/dashboard/xray`) has three sections:
 * 1. API Config — preset/custom URL + API key, save/edit/cancel
 * 2. Test Section — tweet URL input, fetch, tweet card display, raw JSON
 * 3. Bookmarks — load bookmarks (requires configured API)
 *
 * Tests run serially because config state is shared across tests.
 * The test section supports mock data when API is not configured,
 * so we test tweet fetching in the unconfigured (mock) state first,
 * then configure and verify the config flow.
 *
 * Cleanup in afterAll resets xray columns in user_settings.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { executeD1, TEST_USER } from './helpers/d1';

const XRAY_URL = '/dashboard/xray';

/** Navigate to the Xray page and wait for hydration. */
async function goToXray(page: Page): Promise<void> {
  await page.goto(XRAY_URL);
  await page.getByText('API 配置').waitFor({ timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

test.describe.serial('Xray Page', () => {
  // Ensure clean state: clear xray-related columns in user_settings
  test.beforeAll(async () => {
    await executeD1(
      'UPDATE user_settings SET xray_api_url = NULL, xray_api_token = NULL WHERE user_id = ?',
      [TEST_USER.id],
      { softFail: true },
    );
  });

  test.afterAll(async () => {
    await executeD1(
      'UPDATE user_settings SET xray_api_url = NULL, xray_api_token = NULL WHERE user_id = ?',
      [TEST_USER.id],
      { softFail: true },
    );
  });

  // ── Config section: unconfigured state ────────────────────

  test('page renders with config form and test section when unconfigured', async ({ page }) => {
    await goToXray(page);

    // Config card
    await expect(page.getByText('API 配置')).toBeVisible();
    await expect(page.getByText('配置 xray API 的地址和认证 Key')).toBeVisible();

    // URL mode selector buttons (presets + Custom)
    await expect(page.getByRole('button', { name: 'Custom' })).toBeVisible();

    // API key input visible
    await expect(page.locator('[data-testid="xray-api-token"]')).toBeVisible();

    // Save button
    await expect(page.getByRole('button', { name: '保存' })).toBeVisible();

    // Test section card
    await expect(page.getByText('接口测试')).toBeVisible();
    await expect(page.getByText('粘贴 Twitter/X 帖子链接')).toBeVisible();

    // Mock data warning shown when unconfigured
    await expect(page.getByText('未配置 API，将使用 Mock 数据')).toBeVisible();

    // Tweet URL input
    await expect(page.locator('[data-testid="xray-tweet-input"]')).toBeVisible();

    // Fetch button (disabled until URL is entered)
    const fetchBtn = page.getByRole('button', { name: '获取' });
    await expect(fetchBtn).toBeVisible();
    await expect(fetchBtn).toBeDisabled();
  });

  test('bookmarks section shows unconfigured message', async ({ page }) => {
    await goToXray(page);

    // Bookmarks card
    await expect(page.getByText('我的书签')).toBeVisible();

    // Unconfigured message
    await expect(page.getByText('请先在上方配置 xray API')).toBeVisible();

    // Load bookmarks button (disabled when unconfigured)
    const loadBtn = page.getByRole('button', { name: '加载书签' });
    await expect(loadBtn).toBeVisible();
    await expect(loadBtn).toBeDisabled();
  });

  // ── Test section: mock tweet fetch ────────────────────────

  test('entering a tweet URL extracts ID and enables fetch button', async ({ page }) => {
    await goToXray(page);

    const input = page.locator('[data-testid="xray-tweet-input"]');
    const fetchBtn = page.getByRole('button', { name: '获取' });

    // Enter a valid tweet URL
    await input.fill('https://x.com/elonmusk/status/1234567890');

    // ID should be extracted and displayed
    await expect(page.getByText('Tweet ID:')).toBeVisible();
    await expect(page.locator('code').filter({ hasText: '1234567890' })).toBeVisible();

    // Fetch button should now be enabled
    await expect(fetchBtn).toBeEnabled();
  });

  test('entering an invalid URL shows parse error', async ({ page }) => {
    await goToXray(page);

    const input = page.locator('[data-testid="xray-tweet-input"]');

    // Enter an invalid URL
    await input.fill('https://example.com/not-a-tweet');

    // Should show parse error
    await expect(page.getByText('无法解析 Tweet ID')).toBeVisible();

    // Fetch button should remain disabled
    await expect(page.getByRole('button', { name: '获取' })).toBeDisabled();
  });

  test('fetching a tweet shows tweet card with mock data', async ({ page }) => {
    await goToXray(page);

    // Enter a valid tweet URL and fetch
    await page.locator('[data-testid="xray-tweet-input"]').fill('https://x.com/user/status/1234567890');
    await page.getByRole('button', { name: '获取' }).click();

    // Wait for tweet card to appear (mock data)
    // Mock indicator badge should appear
    await expect(page.getByText('Mock 数据')).toBeVisible({ timeout: 10_000 });

    // Tweet card should show content (author, metrics section)
    // The mock data includes standard tweet elements
    await expect(page.getByText('原帖')).toBeVisible();

    // Metric labels should be visible
    await expect(page.getByText('浏览')).toBeVisible();
    await expect(page.getByText('喜欢')).toBeVisible();
  });

  test('raw JSON toggle shows and hides JSON data', async ({ page }) => {
    await goToXray(page);

    // Fetch a tweet first
    await page.locator('[data-testid="xray-tweet-input"]').fill('https://x.com/user/status/1234567890');
    await page.getByRole('button', { name: '获取' }).click();
    await expect(page.getByText('Mock 数据')).toBeVisible({ timeout: 10_000 });

    // Raw JSON toggle button
    const toggleBtn = page.getByRole('button', { name: /原始 JSON/ });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toContainText('展开');

    // Click to expand — should show <pre> with JSON
    await toggleBtn.click();
    await expect(page.locator('pre')).toBeVisible();
    await expect(toggleBtn).toContainText('收起');

    // Click to collapse
    await toggleBtn.click();
    await expect(page.locator('pre')).not.toBeVisible();
  });

  // ── Config section: save config ───────────────────────────

  test('saves API config and shows configured state', async ({ page }) => {
    await goToXray(page);

    // Select Custom URL mode
    await page.getByRole('button', { name: 'Custom' }).click();

    // Fill custom URL
    const urlInput = page.locator('[data-testid="xray-api-url"]');
    await expect(urlInput).toBeVisible();
    await urlInput.fill('https://xray.example.com/api');

    // Fill API key
    await page.locator('[data-testid="xray-api-token"]').fill('e2e-xray-key-12345');

    // Save
    await page.getByRole('button', { name: '保存' }).click();

    // Wait for configured state — API URL displayed
    await expect(page.locator('code').filter({ hasText: 'xray.example.com' })).toBeVisible({ timeout: 10_000 });

    // Masked key displayed
    await expect(page.locator('code').filter({ hasText: /\*{4,}/ })).toBeVisible();

    // Edit button
    await expect(page.getByLabel('编辑配置')).toBeVisible();

    // Mock data warning should be gone
    await expect(page.getByText('未配置 API，将使用 Mock 数据')).not.toBeVisible();
  });

  test('bookmarks section enables load button when configured', async ({ page }) => {
    await goToXray(page);

    // Wait for config to be loaded
    await expect(page.locator('code').filter({ hasText: 'xray.example.com' })).toBeVisible({ timeout: 10_000 });

    // Load bookmarks button should now be enabled
    const loadBtn = page.getByRole('button', { name: '加载书签' });
    await expect(loadBtn).toBeEnabled();

    // Unconfigured message should be gone
    await expect(page.getByText('请先在上方配置 xray API')).not.toBeVisible();

    // Empty state message
    await expect(page.getByText('点击「加载书签」获取您的 X 书签列表')).toBeVisible();
  });

  // ── Config section: edit and cancel ───────────────────────

  test('edit button shows form with current values, cancel returns to display', async ({ page }) => {
    await goToXray(page);

    // Wait for configured state
    await expect(page.getByLabel('编辑配置')).toBeVisible({ timeout: 10_000 });

    // Click edit
    await page.getByLabel('编辑配置').click();

    // Form should appear with API key input
    const tokenInput = page.locator('[data-testid="xray-api-token"]');
    await expect(tokenInput).toBeVisible();

    // Cancel button
    const cancelBtn = page.getByRole('button', { name: '取消' });
    await expect(cancelBtn).toBeVisible();

    // Click cancel — returns to configured display
    await cancelBtn.click();
    await expect(page.locator('code').filter({ hasText: 'xray.example.com' })).toBeVisible({ timeout: 5_000 });
    await expect(tokenInput).not.toBeVisible();
  });
});
