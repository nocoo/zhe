/**
 * E2E: Tag UI — filter by tag.
 *
 * Split from tags.spec.ts. Uses a shared beforeAll to seed two links + one
 * tag, then exercises the tag-filter UI.
 */
import { test, expect } from './fixtures';
import {
  waitForLinksPage,
  createLink,
  openEditMode,
  createTagInEditMode,
  saveAndCloseEdit,
} from './helpers/tags';

test.describe('Tag UI - filter by tag', () => {
  let slug1: string;
  let slug2: string;
  let tagName: string;

  // CI environment is slow — increase beforeAll timeout
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({
      storageState: 'tests/playwright/.auth/user.json',
    });
    const page = await context.newPage();
    const ts = Date.now();
    slug1 = `e2e-filter1-${ts}`;
    slug2 = `e2e-filter2-${ts}`;
    tagName = `filter-tag-${ts}`;

    await page.goto('/dashboard');
    await waitForLinksPage(page);

    await createLink(page, 'https://example.com/filter-1', slug1);
    await createLink(page, 'https://example.com/filter-2', slug2);

    const card = await openEditMode(page, slug1);
    await createTagInEditMode(page, card, tagName);
    await saveAndCloseEdit(card);

    await context.close();
  });

  test('filtering by tag shows only tagged links', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    const main = page.locator('main');

    await expect(main.getByText(slug1)).toBeVisible({ timeout: 10_000 });
    await expect(main.getByText(slug2)).toBeVisible({ timeout: 10_000 });

    await main.locator('[data-testid="tag-filter-trigger"]').click();

    const tagItem = page.locator(`[data-testid="tag-filter-item"][data-tag-name="${tagName}"]`);
    await expect(tagItem).toBeVisible({ timeout: 5_000 });
    await tagItem.click();

    await page.keyboard.press('Escape');

    await expect(
      main.locator(`[data-testid="active-tag-filter"][data-tag-name="${tagName}"]`),
    ).toBeVisible({ timeout: 5_000 });

    await expect(main.getByText(slug1)).toBeVisible({ timeout: 10_000 });
    await expect(main.getByText(slug2)).toBeHidden({ timeout: 10_000 });

    await expect(main.getByText(/\d+ \/ \d+ 条链接/)).toBeVisible();
  });

  test('clearing tag filter restores all links', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    const main = page.locator('main');

    await main.locator('[data-testid="tag-filter-trigger"]').click();
    const tagItem = page.locator(`[data-testid="tag-filter-item"][data-tag-name="${tagName}"]`);
    await tagItem.click();
    await page.keyboard.press('Escape');

    await expect(main.getByText(slug2)).toBeHidden({ timeout: 5_000 });

    await main.locator('[data-testid="clear-filters"]').click();

    await expect(main.getByText(slug1)).toBeVisible({ timeout: 5_000 });
    await expect(main.getByText(slug2)).toBeVisible({ timeout: 5_000 });
  });

  test('remove active tag filter badge deselects the tag', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    const main = page.locator('main');

    await main.locator('[data-testid="tag-filter-trigger"]').click();
    const tagItem = page.locator(`[data-testid="tag-filter-item"][data-tag-name="${tagName}"]`);
    await tagItem.click();
    await page.keyboard.press('Escape');

    const activeBadge = main.locator(`[data-testid="active-tag-filter"][data-tag-name="${tagName}"]`);
    await expect(activeBadge).toBeVisible({ timeout: 3_000 });
    await expect(main.getByText(slug2)).toBeHidden({ timeout: 5_000 });

    await activeBadge.locator(`button[aria-label="Remove filter ${tagName}"]`).click();

    await expect(activeBadge).toBeHidden({ timeout: 3_000 });
    await expect(main.getByText(slug1)).toBeVisible({ timeout: 5_000 });
    await expect(main.getByText(slug2)).toBeVisible({ timeout: 5_000 });
  });

  test('tag filter shows count in trigger button', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLinksPage(page);

    const main = page.locator('main');
    const trigger = main.locator('[data-testid="tag-filter-trigger"]');

    await expect(trigger).toHaveText('标签');

    await trigger.click();
    const tagItem = page.locator(`[data-testid="tag-filter-item"][data-tag-name="${tagName}"]`);
    await tagItem.click();
    await page.keyboard.press('Escape');

    await expect(trigger).toHaveText('标签 (1)');
  });
});
