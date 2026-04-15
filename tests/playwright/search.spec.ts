/**
 * E2E: Cmd+K search dialog — open, query, verify results, interact.
 *
 * Creates links via the dashboard UI, then uses the search dialog
 * to find them by slug and URL, and verifies the result interactions.
 */
import { test, expect } from './fixtures';

/** Helper: wait for link-crud page to finish loading inside <main>. */
async function waitForLinksPage(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('main').getByRole('button', { name: '刷新链接' }).waitFor({ timeout: 15_000 });
}

/** Helper: create a link with a custom slug via the dashboard UI. */
async function createLink(
  page: import('@playwright/test').Page,
  slug: string,
  url: string,
): Promise<void> {
  const main = page.locator('main');
  await main.getByRole('button', { name: '新建链接' }).first().click();
  await page.locator('button:has-text("自定义 slug")').click();
  await page.locator('#url').fill(url);
  await page.locator('#slug').fill(slug);
  await page.locator('button:has-text("创建链接")').click();
  await expect(page.getByText('创建短链接')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(slug)).toBeVisible({ timeout: 10_000 });
}

/** Helper: open the search dialog with Cmd+K. */
async function openSearchDialog(page: import('@playwright/test').Page): Promise<void> {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+k`);
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 10_000 });
}

test.describe('Cmd+K search', () => {
  const ts = Date.now();
  const slug1 = `e2e-search-alpha-${ts}`;
  const slug2 = `e2e-search-beta-${ts}`;
  const url1 = 'https://playwright.dev/docs/search-test';
  const url2 = 'https://github.com/example/search-beta';

  // Create two links once, before all tests in this describe block
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'tests/playwright/.auth/user.json' });
    const page = await context.newPage();

    await page.goto('/dashboard');
    await waitForLinksPage(page);
    await createLink(page, slug1, url1);
    await createLink(page, slug2, url2);

    await context.close();
  });

  test('search dialog opens on Cmd+K and shows hint text', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    await openSearchDialog(page);

    // Should show the search input placeholder
    await expect(page.locator('[placeholder="搜索链接、想法、标题、备注、标签..."]')).toBeVisible();

    // Should show hint text when input is empty
    await expect(page.getByText('输入关键词搜索')).toBeVisible();
  });

  test('search by slug shows matching link', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    await openSearchDialog(page);

    const input = page.locator('[placeholder="搜索链接、想法、标题、备注、标签..."]');
    await input.fill('alpha');

    // Should find the first link (slug contains "alpha")
    const resultItem = page.locator(`[cmdk-item][data-value="${slug1}"]`);
    await expect(resultItem).toBeVisible({ timeout: 5_000 });

    // Should NOT show the other link
    await expect(page.locator(`[cmdk-item][data-value="${slug2}"]`)).not.toBeVisible();
  });

  test('search by URL hostname shows matching link', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    await openSearchDialog(page);

    const input = page.locator('[placeholder="搜索链接、想法、标题、备注、标签..."]');
    await input.fill('playwright');

    // Should find the first link (URL contains "playwright")
    const resultItem = page.locator(`[cmdk-item][data-value="${slug1}"]`);
    await expect(resultItem).toBeVisible({ timeout: 5_000 });
  });

  test('non-matching query shows empty state', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    await openSearchDialog(page);

    const input = page.locator('[placeholder="搜索链接、想法、标题、备注、标签..."]');
    await input.fill('zzz-nonexistent-query');

    // Should show the empty state message
    await expect(page.getByText('没有找到匹配的结果')).toBeVisible({ timeout: 5_000 });
  });

  test('search results show result count in heading', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    await openSearchDialog(page);

    const input = page.locator('[placeholder="搜索链接、想法、标题、备注、标签..."]');
    // Search for "e2e-search" which should match both links
    await input.fill(`e2e-search`);

    // The heading shows "链接 (N)" where N is the count
    await expect(page.locator('[cmdk-group-heading]')).toContainText('链接');

    // Both items should be visible
    await expect(page.locator(`[cmdk-item][data-value="${slug1}"]`)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(`[cmdk-item][data-value="${slug2}"]`)).toBeVisible();
  });

  test('selecting a search result opens the original URL', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    await openSearchDialog(page);

    const input = page.locator('[placeholder="搜索链接、想法、标题、备注、标签..."]');
    await input.fill('alpha');

    const resultItem = page.locator(`[cmdk-item][data-value="${slug1}"]`);
    await expect(resultItem).toBeVisible({ timeout: 5_000 });

    // cmdk fires onSelect on Enter — listen for popup (new tab via window.open)
    const popupPromise = page.waitForEvent('popup');
    await page.keyboard.press('Enter');
    const popup = await popupPromise;

    // The popup should navigate to the original URL
    await popup.waitForLoadState();
    expect(popup.url()).toContain('playwright.dev');
    await popup.close();
  });

  test('Escape key closes the search dialog', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    await openSearchDialog(page);

    // Press Escape to close
    await page.keyboard.press('Escape');

    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('clicking search button in sidebar opens the dialog', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    // Click the search button in sidebar
    await page.locator('text=搜索链接...').click();

    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[placeholder="搜索链接、想法、标题、备注、标签..."]')).toBeVisible();
  });
});
