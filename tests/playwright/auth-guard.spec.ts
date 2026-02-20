/**
 * E2E: Auth guard — dashboard access control.
 *
 * Verifies that unauthenticated users are redirected away from
 * the dashboard, and authenticated users can access it.
 */
import { test, expect } from './fixtures';

test.describe('Auth guard (unauthenticated)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects /dashboard to landing with callbackUrl', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '');

    // Should have callbackUrl param
    const url = new URL(page.url());
    expect(url.searchParams.get('callbackUrl')).toBe('/dashboard');

    // Landing page should be visible
    await expect(page.locator('text=就是这')).toBeVisible();
  });

  test('redirects /dashboard/settings to landing', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '');

    const url = new URL(page.url());
    expect(url.searchParams.get('callbackUrl')).toBe('/dashboard/settings');
  });

  test('redirects /dashboard/overview to landing', async ({ page }) => {
    await page.goto('/dashboard/overview');
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '');

    const url = new URL(page.url());
    expect(url.searchParams.get('callbackUrl')).toBe('/dashboard/overview');
  });
});

test.describe('Auth guard (authenticated)', () => {
  // Uses the default storageState from config (authenticated)

  test('can access /dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    // Should stay on dashboard — header shows correct title
    await expect(page.locator('h1')).toContainText('链接管理');
  });

  test('authenticated user visiting / is redirected to dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/dashboard');

    await expect(page.locator('h1')).toContainText('链接管理');
  });
});
