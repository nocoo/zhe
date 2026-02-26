/**
 * E2E: Link CRUD — create, view, edit, and delete links.
 *
 * Tests run against the real D1 database. The global-setup ensures
 * the E2E test user exists. Each test creates its own data and
 * the global-teardown cleans everything up.
 */
import { test, expect } from './fixtures';

/** Helper: wait for link-crud page to finish loading inside <main>. */
async function waitForLinksPage(page: import('@playwright/test').Page): Promise<void> {
  // Wait for the refresh button (unique, always present in links header)
  await page.locator('main').getByRole('button', { name: '刷新链接' }).waitFor({ timeout: 15_000 });
}

test.describe('Link CRUD', () => {
  test.describe('header UI', () => {
    test('shows links list header with create button', async ({ page }) => {
      await page.goto('/dashboard');
      await waitForLinksPage(page);

      const main = page.locator('main');
      // "新建链接" may appear twice (header + empty-state) — verify at least one
      await expect(main.getByRole('button', { name: '新建链接' }).first()).toBeVisible();
      await expect(main.getByRole('button', { name: '刷新链接' })).toBeVisible();
      await expect(main.getByRole('button', { name: 'List view' })).toBeVisible();
      await expect(main.getByRole('button', { name: 'Grid view' })).toBeVisible();
    });
  });

  test.describe('create link', () => {
    test('create link in simple mode', async ({ page }) => {
      await page.goto('/dashboard');
      await waitForLinksPage(page);

      const main = page.locator('main');

      // Open create dialog — use .first() because empty-state also has this button
      await main.getByRole('button', { name: '新建链接' }).first().click();
      await expect(page.getByText('创建短链接')).toBeVisible();

      // Simple mode should be selected by default
      await expect(page.locator('button:has-text("简单模式")')).toBeVisible();

      // Enter URL
      await page.locator('#url').fill('https://playwright.dev/docs/intro');

      // Submit
      await page.locator('button:has-text("创建链接")').click();

      // Wait for dialog to close (link created)
      await expect(page.getByText('创建短链接')).toBeHidden({ timeout: 15_000 });

      // Verify the link appears in the list
      await expect(page.getByText('playwright.dev')).toBeVisible({ timeout: 10_000 });
    });

    test('create link with custom slug', async ({ page }) => {
      const customSlug = `e2e-custom-${Date.now()}`;

      await page.goto('/dashboard');
      await waitForLinksPage(page);

      const main = page.locator('main');

      // Open create dialog
      await main.getByRole('button', { name: '新建链接' }).first().click();

      // Switch to custom slug mode
      await page.locator('button:has-text("自定义 slug")').click();

      // Enter URL and custom slug
      await page.locator('#url').fill('https://example.com/custom-test');
      await page.locator('#slug').fill(customSlug);

      // Submit
      await page.locator('button:has-text("创建链接")').click();

      // Wait for dialog to close
      await expect(page.getByText('创建短链接')).toBeHidden({ timeout: 15_000 });

      // Verify the link with custom slug appears
      await expect(page.getByText(customSlug)).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('view and interact with links', () => {
    let testSlug: string;

    test.beforeEach(async ({ page }) => {
      testSlug = `e2e-view-${Date.now()}`;
      await page.goto('/dashboard');
      await waitForLinksPage(page);

      const main = page.locator('main');

      // Create a link via UI
      await main.getByRole('button', { name: '新建链接' }).first().click();
      await page.locator('button:has-text("自定义 slug")').click();
      await page.locator('#url').fill('https://github.com/microsoft/playwright');
      await page.locator('#slug').fill(testSlug);
      await page.locator('button:has-text("创建链接")').click();
      await expect(page.getByText('创建短链接')).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText(testSlug)).toBeVisible({ timeout: 10_000 });
    });

    test('copy short link', async ({ page }) => {
      // Locate the link-card that contains our slug
      const card = page.locator(`[data-testid="link-card"]:has-text("${testSlug}")`).first();
      const copyButton = card.getByRole('button', { name: 'Copy link' }).first();

      // Grant clipboard permissions
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

      await copyButton.click();

      // Verify clipboard contains the short link URL with our slug
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain(testSlug);
    });

    test('toggle view mode between list and grid', async ({ page }) => {
      const main = page.locator('main');
      const gridButton = main.getByRole('button', { name: 'Grid view' });
      const listButton = main.getByRole('button', { name: 'List view' });

      // Switch to grid
      await gridButton.click();
      await expect(page.getByText(testSlug)).toBeVisible();

      // Switch back to list
      await listButton.click();
      await expect(page.getByText(testSlug)).toBeVisible();
    });

    test('edit link', async ({ page }) => {
      // Locate the link-card that contains our slug
      const card = page.locator(`[data-testid="link-card"]:has-text("${testSlug}")`).first();
      const editButton = card.getByRole('button', { name: 'Edit link' }).first();

      await editButton.click();

      // Inline edit area should appear inside the card (note input becomes visible)
      const noteInput = card.locator('textarea[id^="edit-note-"]');
      await expect(noteInput).toBeVisible({ timeout: 5_000 });

      // Modify the note
      await noteInput.fill('E2E test note');

      // Save
      await card.locator('button:has-text("保存")').click();

      // Edit area should collapse after save (note input hidden)
      await expect(noteInput).toBeHidden({ timeout: 10_000 });
    });

    test('delete link', async ({ page }) => {
      // Locate the link-card that contains our slug
      const card = page.locator(`[data-testid="link-card"]:has-text("${testSlug}")`).first();

      // Enter edit mode first — delete button is inside the inline edit area
      const editButton = card.getByRole('button', { name: 'Edit link' }).first();
      await editButton.click();

      // Wait for edit area to appear, then click delete
      const deleteButton = card.getByRole('button', { name: 'Delete link' }).first();
      await expect(deleteButton).toBeVisible({ timeout: 5_000 });
      await deleteButton.click();

      // Confirmation dialog
      await expect(page.getByText('确认删除')).toBeVisible();
      await expect(page.getByText('此操作不可撤销')).toBeVisible();

      // Confirm — click the destructive "删除" button in the dialog
      const dialog = page.locator('[role="alertdialog"]');
      await dialog.getByRole('button', { name: '删除' }).click();

      // Link should disappear
      await expect(page.getByText(testSlug)).toBeHidden({ timeout: 10_000 });
    });
  });

  test.describe('refresh links', () => {
    test('refresh button reloads data', async ({ page }) => {
      await page.goto('/dashboard');
      await waitForLinksPage(page);

      const main = page.locator('main');

      // Click refresh
      await main.getByRole('button', { name: '刷新链接' }).click();

      // Verify page still shows the links header (scoped to main)
      await expect(main.getByText('全部链接')).toBeVisible();
    });
  });
});
