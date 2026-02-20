/**
 * E2E: Landing page — unauthenticated experience.
 *
 * Verifies the public landing page renders correctly and
 * redirects authenticated users to the dashboard.
 */
import { test, expect } from './fixtures';

// These tests run WITHOUT the shared auth storageState
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Landing page', () => {
  test('renders branding and sign-in button', async ({ page }) => {
    await page.goto('/');

    // Branding elements
    await expect(page.locator('text=就是这')).toBeVisible();
    await expect(page.locator('text=登录以管理您的短链接')).toBeVisible();
    await expect(page.locator('text=Secure authentication')).toBeVisible();

    // Google sign-in button
    const signInButton = page.getByRole('button', { name: 'Continue with Google' });
    await expect(signInButton).toBeVisible();
  });

  test('shows GitHub link and theme toggle', async ({ page }) => {
    await page.goto('/');

    // GitHub link
    const githubLink = page.locator('a[title="GitHub"]');
    await expect(githubLink).toBeVisible();
    await expect(githubLink).toHaveAttribute('href', 'https://github.com/nocoo/zhe');
  });

  test('/login redirects to landing page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForURL('/');

    await expect(page.locator('text=就是这')).toBeVisible();
  });
});
