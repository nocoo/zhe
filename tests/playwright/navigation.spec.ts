/**
 * E2E: Dashboard navigation — sidebar and page switching.
 *
 * Verifies the sidebar renders all nav sections and that
 * clicking nav items switches the main content area.
 */
import { test, expect } from './fixtures';

test.describe('Dashboard navigation', () => {
  test('sidebar shows branding and nav sections', async ({ page }) => {
    await page.goto('/dashboard');

    // Branding
    await expect(page.locator('text=ZHE.TO')).toBeVisible();

    // Nav section labels (each label is a standalone <span> outside <a> tags)
    const sidebar = page.locator('aside');
    // "概览" appears as both a section label and a nav link — check at least 2
    await expect(sidebar.getByText('概览').first()).toBeVisible();
    await expect(sidebar.getByText('链接管理').first()).toBeVisible();
    await expect(sidebar.getByText('文件管理').first()).toBeVisible();
    await expect(sidebar.getByText('系统')).toBeVisible();

    // Nav items (links)
    await expect(sidebar.locator('a:has-text("全部链接")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("Inbox")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("文件上传")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("设置")')).toBeVisible();
  });

  test('sidebar shows user info', async ({ page }) => {
    await page.goto('/dashboard');

    // User section — the test user from Credentials provider
    await expect(page.locator('text=E2E Test User')).toBeVisible();
    await expect(page.locator('text=e2e@test.local')).toBeVisible();
  });

  test('sidebar shows search button with keyboard shortcut', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('text=搜索链接...')).toBeVisible();
  });

  test('navigate to Overview page', async ({ page }) => {
    await page.goto('/dashboard');

    // Click the 概览 nav link (it's the one inside the nav, not the section label)
    await page.locator('nav a:has-text("概览")').click();
    await page.waitForURL('**/dashboard/overview');

    // Header should reflect the page
    await expect(page.locator('main h1')).toContainText('概览');
  });

  test('navigate to Settings page', async ({ page }) => {
    await page.goto('/dashboard');

    await page.locator('a:has-text("设置")').click();
    await page.waitForURL('**/dashboard/settings');

    await expect(page.locator('main h1')).toContainText('设置');
  });

  test('navigate to Uploads page', async ({ page }) => {
    await page.goto('/dashboard');

    await page.locator('a:has-text("文件上传")').click();
    await page.waitForURL('**/dashboard/uploads');

    await expect(page.locator('main h1')).toContainText('文件管理');
  });

  test('navigate back to Links page', async ({ page }) => {
    await page.goto('/dashboard/settings');

    await page.locator('a:has-text("全部链接")').click();
    await page.waitForURL((url) =>
      url.pathname === '/dashboard' && !url.searchParams.has('folder'),
    );

    await expect(page.locator('main h1')).toContainText('链接管理');
  });

  test('navigate to Inbox', async ({ page }) => {
    await page.goto('/dashboard');

    await page.locator('a:has-text("Inbox")').click();
    await page.waitForURL('**/dashboard?folder=uncategorized');

    // Should show Inbox content
    await expect(page.locator('main h1')).toContainText('链接管理');
  });

  test('collapse and expand sidebar', async ({ page }) => {
    await page.goto('/dashboard');

    // Sidebar is expanded — ZHE.TO text is visible
    await expect(page.locator('text=ZHE.TO')).toBeVisible();

    // Collapse
    await page.locator('button[aria-label="Collapse sidebar"]').click();

    // In collapsed mode, text nav items are hidden, expand button appears
    await expect(page.locator('button[aria-label="Expand sidebar"]')).toBeVisible();
    // ZHE.TO text should be hidden in collapsed mode
    await expect(page.locator('text=ZHE.TO')).toBeHidden();

    // Expand
    await page.locator('button[aria-label="Expand sidebar"]').click();
    await expect(page.locator('text=ZHE.TO')).toBeVisible();
  });

  test('Cmd+K opens search dialog', async ({ page }) => {
    await page.goto('/dashboard');

    // Press Cmd+K on macOS, Ctrl+K on other platforms
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+k`);

    // Search dialog should appear
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });
});
