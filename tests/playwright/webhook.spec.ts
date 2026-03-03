/**
 * E2E: Webhook management UI — generate token, copy, revoke, rate limit,
 * usage documentation.
 *
 * The webhook page (`/dashboard/webhook`) allows users to manage their
 * webhook token for external API access. Tests run serially because
 * token state is shared; cleanup in afterAll ensures no leftover tokens.
 *
 * Global teardown also cleans webhooks for the test user.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { executeD1, TEST_USER } from './helpers/d1';

const WEBHOOK_URL = '/dashboard/webhook';

/** Navigate to webhook page and wait for it to be hydrated. */
async function goToWebhook(page: Page): Promise<void> {
  await page.goto(WEBHOOK_URL);
  // Wait for the Webhook card title to appear (SSR content)
  await page.getByText('Webhook').first().waitFor({ timeout: 15_000 });
  // Wait for network idle — ensures all JS chunks have loaded and React
  // hydration has completed, so onClick handlers are attached.
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

test.describe.serial('Webhook Management UI', () => {
  // Ensure clean state: no existing webhook token for the test user
  test.beforeAll(async () => {
    await executeD1('DELETE FROM webhooks WHERE user_id = ?', [TEST_USER.id], { softFail: true });
  });

  test.afterAll(async () => {
    await executeD1('DELETE FROM webhooks WHERE user_id = ?', [TEST_USER.id], { softFail: true });
  });

  test('page renders with description and generate button when no token exists', async ({ page }) => {
    await goToWebhook(page);

    // Description text
    await expect(page.getByText('通过 Webhook 令牌，外部系统可以调用 API 创建短链接')).toBeVisible();

    // Generate button visible (initial state)
    const generateBtn = page.locator('[data-testid="generate-token-btn"]');
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toHaveText('生成令牌');

    // Token section should NOT be visible
    await expect(page.locator('[data-testid="webhook-token-section"]')).not.toBeVisible();
  });

  test('generates a token and displays token section', async ({ page }) => {
    await goToWebhook(page);

    // Click generate
    await page.locator('[data-testid="generate-token-btn"]').click();

    // Wait for token section to appear
    const tokenSection = page.locator('[data-testid="webhook-token-section"]');
    await expect(tokenSection).toBeVisible({ timeout: 10_000 });

    // Token value is displayed (non-empty)
    const tokenValue = page.locator('[data-testid="webhook-token-value"]');
    await expect(tokenValue).toBeVisible();
    const tokenText = await tokenValue.textContent();
    expect(tokenText).toBeTruthy();
    expect(tokenText!.length).toBeGreaterThan(8);

    // Webhook URL is displayed (contains /api/webhook/ and the token)
    const urlValue = page.locator('[data-testid="webhook-url-value"]');
    await expect(urlValue).toBeVisible();
    const urlText = await urlValue.textContent();
    expect(urlText).toContain('/api/webhook/');
    expect(urlText).toContain(tokenText!);
  });

  test('shows regenerate and revoke buttons when token exists', async ({ page }) => {
    await goToWebhook(page);

    // Wait for token section
    await expect(page.locator('[data-testid="webhook-token-section"]')).toBeVisible({ timeout: 10_000 });

    // Regenerate button
    const regenBtn = page.locator('[data-testid="regenerate-token-btn"]');
    await expect(regenBtn).toBeVisible();
    await expect(regenBtn).toHaveText('重新生成');

    // Revoke button
    const revokeBtn = page.locator('[data-testid="revoke-token-btn"]');
    await expect(revokeBtn).toBeVisible();
    await expect(revokeBtn).toHaveText('撤销令牌');
  });

  test('shows copy buttons for token and URL', async ({ page }) => {
    await goToWebhook(page);
    await expect(page.locator('[data-testid="webhook-token-section"]')).toBeVisible({ timeout: 10_000 });

    // Copy token button
    await expect(page.locator('[data-testid="copy-token-btn"]')).toBeVisible();

    // Copy URL button
    await expect(page.locator('[data-testid="copy-url-btn"]')).toBeVisible();
  });

  test('shows rate limit display and slider', async ({ page }) => {
    await goToWebhook(page);
    await expect(page.locator('[data-testid="webhook-token-section"]')).toBeVisible({ timeout: 10_000 });

    // Rate limit value (default: 5 次/分钟)
    const rateLimitValue = page.locator('[data-testid="rate-limit-value"]');
    await expect(rateLimitValue).toBeVisible();
    await expect(rateLimitValue).toContainText('次/分钟');

    // Slider is visible
    await expect(page.locator('[data-testid="rate-limit-slider"]')).toBeVisible();
  });

  test('shows usage documentation section', async ({ page }) => {
    await goToWebhook(page);
    await expect(page.locator('[data-testid="webhook-token-section"]')).toBeVisible({ timeout: 10_000 });

    // Usage docs section
    const usageDocs = page.locator('[data-testid="webhook-usage-docs"]');
    await expect(usageDocs).toBeVisible();

    // Documentation subsections
    await expect(usageDocs.getByText('使用说明')).toBeVisible();
    await expect(usageDocs.getByText('支持的方法')).toBeVisible();
    await expect(usageDocs.getByText('请求示例')).toBeVisible();
    await expect(usageDocs.getByText('速率限制')).toBeVisible();
    await expect(usageDocs.getByText('错误码')).toBeVisible();

    // Curl example is present (use .first() — the agent prompt section also contains "curl")
    await expect(usageDocs.getByText(/curl/).first()).toBeVisible();

    // HTTP methods listed in the methods table (use exact match to avoid
    // collisions with summary text like "Get status..." or "Create a short link")
    const methodsTable = usageDocs.locator('table').first();
    await expect(methodsTable.getByText('HEAD', { exact: true })).toBeVisible();
    await expect(methodsTable.getByText('GET', { exact: true })).toBeVisible();
    await expect(methodsTable.getByText('POST', { exact: true })).toBeVisible();
  });

  test('regenerates token and gets a new value', async ({ page }) => {
    await goToWebhook(page);
    await expect(page.locator('[data-testid="webhook-token-section"]')).toBeVisible({ timeout: 10_000 });

    // Capture current token
    const tokenEl = page.locator('[data-testid="webhook-token-value"]');
    const oldToken = await tokenEl.textContent();

    // Click regenerate. Use Promise.all to start listening for the server
    // action POST response before the click triggers it.
    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST'
          && resp.url().includes('/dashboard/webhook')
          // Filter for the action response that contains the new token,
          // not the RSC layout revalidation response.
          && resp.text().then((t) => t.includes('"token"')).catch(() => false),
        { timeout: 15_000 },
      ),
      page.locator('[data-testid="regenerate-token-btn"]').click(),
    ]);

    expect(response.status()).toBe(200);

    // Wait for React to re-render with the new token
    await expect(tokenEl).not.toHaveText(oldToken!, { timeout: 5_000 });

    const newToken = await tokenEl.textContent();
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);

    // URL is updated to contain the new token
    const urlText = await page.locator('[data-testid="webhook-url-value"]').textContent();
    expect(urlText).toContain(newToken!);
  });

  test('revokes token and returns to initial state', async ({ page }) => {
    await goToWebhook(page);
    await expect(page.locator('[data-testid="webhook-token-section"]')).toBeVisible({ timeout: 10_000 });

    // Click revoke. Filter for the action response (contains "success")
    // rather than the RSC layout revalidation response.
    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST'
          && resp.url().includes('/dashboard/webhook')
          && resp.text().then((t) => !t.includes('"linkTags"')).catch(() => false),
        { timeout: 15_000 },
      ),
      page.locator('[data-testid="revoke-token-btn"]').click(),
    ]);

    expect(response.status()).toBe(200);

    // Token section disappears after the action completes
    await expect(page.locator('[data-testid="webhook-token-section"]')).not.toBeVisible({ timeout: 10_000 });

    // Generate button is back
    const generateBtn = page.locator('[data-testid="generate-token-btn"]');
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toHaveText('生成令牌');
  });

  test('can generate token again after revoking', async ({ page }) => {
    await goToWebhook(page);

    // Currently no token (revoked in previous test)
    await expect(page.locator('[data-testid="generate-token-btn"]')).toBeVisible({ timeout: 10_000 });

    // Generate a new token
    await page.locator('[data-testid="generate-token-btn"]').click();

    // Token section appears
    const tokenSection = page.locator('[data-testid="webhook-token-section"]');
    await expect(tokenSection).toBeVisible({ timeout: 10_000 });

    // Token value is valid
    const tokenText = await page.locator('[data-testid="webhook-token-value"]').textContent();
    expect(tokenText).toBeTruthy();
    expect(tokenText!.length).toBeGreaterThan(8);
  });

});
