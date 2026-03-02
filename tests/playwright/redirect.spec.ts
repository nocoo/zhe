/**
 * E2E: Short link 307 redirect — the core product flow.
 *
 * Creates a link via the dashboard UI, then visits the short URL
 * directly and verifies the browser is redirected to the target URL.
 */
import { test, expect } from './fixtures';

/** Helper: wait for link-crud page to finish loading inside <main>. */
async function waitForLinksPage(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('main').getByRole('button', { name: '刷新链接' }).waitFor({ timeout: 15_000 });
}

test.describe('Short link redirect', () => {
  test('visiting a short link returns 307 redirect to target URL', async ({ page, request }) => {
    const slug = `e2e-redir-${Date.now()}`;
    const targetUrl = 'https://example.com/redirect-test';

    // Step 1: Create a link with a known custom slug via the dashboard UI
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    const main = page.locator('main');
    await main.getByRole('button', { name: '新建链接' }).first().click();
    await page.locator('button:has-text("自定义 slug")').click();
    await page.locator('#url').fill(targetUrl);
    await page.locator('#slug').fill(slug);
    await page.locator('button:has-text("创建链接")').click();
    await expect(page.getByText('创建短链接')).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(slug)).toBeVisible({ timeout: 10_000 });

    // Step 2: Use the API request context to fetch the short link
    // with redirect: 'manual' so we can inspect the 307 status
    const response = await request.get(`/${slug}`, {
      maxRedirects: 0,
    });

    // Step 3: Verify the response is a 307 redirect to the target URL
    expect(response.status()).toBe(307);
    expect(response.headers()['location']).toBe(targetUrl);
  });

  test('visiting a non-existent slug shows not-found page', async ({ page }) => {
    const fakeSlug = `e2e-nonexistent-${Date.now()}`;

    // Visit the non-existent slug directly
    await page.goto(`/${fakeSlug}`);

    // Should show the not-found page
    await expect(page.locator('text=404')).toBeVisible({ timeout: 10_000 });
  });

  test('multiple redirects all return 307 to the same target', async ({ page, request }) => {
    const slug = `e2e-multi-${Date.now()}`;
    const targetUrl = 'https://example.com/multi-redirect-test';

    // Create a link
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    const main = page.locator('main');
    await main.getByRole('button', { name: '新建链接' }).first().click();
    await page.locator('button:has-text("自定义 slug")').click();
    await page.locator('#url').fill(targetUrl);
    await page.locator('#slug').fill(slug);
    await page.locator('button:has-text("创建链接")').click();
    await expect(page.getByText('创建短链接')).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(slug)).toBeVisible({ timeout: 10_000 });

    // Fire 3 redirect requests — all should return 307 to the same target
    for (let i = 0; i < 3; i++) {
      const res = await request.get(`/${slug}`, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()['location']).toBe(targetUrl);
    }
  });
});
