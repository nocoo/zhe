/**
 * E2E: Tag UI — create tags, assign to links, verify display, filter by tag.
 *
 * Tests run against the real D1 database. Each test creates its own data;
 * the global-teardown cleans up tags + link_tags (cascade via links DELETE).
 */
import { test, expect } from './fixtures';
import type { Page, Locator } from '@playwright/test';

/** Helper: wait for link-list page to finish loading inside <main>. */
async function waitForLinksPage(page: Page): Promise<void> {
  await page.locator('main').getByRole('button', { name: '刷新链接' }).waitFor({ timeout: 15_000 });
}

/** Helper: create a link via UI. */
async function createLink(page: Page, url: string, slug: string): Promise<void> {
  const main = page.locator('main');
  await main.getByRole('button', { name: '新建链接' }).first().click();
  await page.locator('button:has-text("自定义 slug")').click();
  await page.locator('#url').fill(url);
  await page.locator('#slug').fill(slug);
  await page.locator('button:has-text("创建链接")').click();
  await expect(page.getByText('创建短链接')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(slug)).toBeVisible({ timeout: 10_000 });
}

/** Helper: enter edit mode for a link card identified by slug text. */
async function openEditMode(page: Page, slug: string): Promise<Locator> {
  const card = page.locator(`[data-testid="link-card"]:has-text("${slug}")`).first();
  await card.getByRole('button', { name: 'Edit link' }).first().click();
  await expect(card.locator('[data-testid="edit-area"]')).toBeVisible({ timeout: 5_000 });
  return card;
}

/**
 * Helper: create a tag via the TagPicker in edit mode.
 *
 * Note: The TagPicker popover content renders in a Radix portal outside
 * the card DOM tree. We must locate popover elements at page level.
 */
async function createTagInEditMode(page: Page, card: Locator, tagName: string): Promise<void> {
  // Open the tag picker popover
  await card.locator('[data-testid="tag-picker-trigger"]').click();

  // Type the new tag name — popover is in a portal, so use page-level locator
  const pickerInput = page.locator('[cmdk-input]').last();
  await pickerInput.fill(tagName);

  // Click the "创建" option (also in the portal)
  const createOption = page.locator('[data-testid="tag-create-option"]');
  await expect(createOption).toBeVisible({ timeout: 3_000 });
  await createOption.click();

  // Verify the tag badge appears in the edit area (scoped to avoid strict mode violation
  // since the tag also renders in the card's read-only area simultaneously)
  const editArea = card.locator('[data-testid="edit-area"]');
  await expect(editArea.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`)).toBeVisible({ timeout: 5_000 });
}

test.describe('Tag UI', () => {
  test.describe('create and display tags', () => {
    let slug: string;

    test.beforeEach(async ({ page }) => {
      slug = `e2e-tag-${Date.now()}`;
      await page.goto('/dashboard');
      await waitForLinksPage(page);
      await createLink(page, 'https://example.com/tag-test', slug);
    });

    test('create a tag via TagPicker in edit mode', async ({ page }) => {
      const tagName = `tag-create-${Date.now()}`;
      const card = await openEditMode(page, slug);
      await createTagInEditMode(page, card, tagName);

      // Save the edit
      await card.locator('button:has-text("保存")').click();
      await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

      // Verify the tag badge is visible on the card (read-only mode)
      await expect(
        card.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('assign an existing tag to a link', async ({ page }) => {
      const tagName = `tag-existing-${Date.now()}`;

      // First create a tag on this link
      let card = await openEditMode(page, slug);
      await createTagInEditMode(page, card, tagName);
      await card.locator('button:has-text("保存")').click();
      await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

      // Create a second link
      const slug2 = `e2e-tag2-${Date.now()}`;
      await createLink(page, 'https://example.com/tag-test-2', slug2);

      // Enter edit mode on the second link
      card = await openEditMode(page, slug2);

      // Open tag picker — popover is in a portal
      await card.locator('[data-testid="tag-picker-trigger"]').click();
      const pickerInput = page.locator('[cmdk-input]').last();
      await pickerInput.fill(tagName);

      // The existing tag should appear (not "创建" but the existing item)
      const tagItem = page.locator(`[cmdk-item]:has-text("${tagName}")`).first();
      await expect(tagItem).toBeVisible({ timeout: 3_000 });
      await tagItem.click();

      // Verify the tag badge appears in edit area
      await expect(
        card.locator('[data-testid="edit-area"]').locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
      ).toBeVisible({ timeout: 5_000 });

      // Save
      await card.locator('button:has-text("保存")').click();
      await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

      // Verify tag on card in read-only mode
      await expect(
        card.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('remove a tag from a link in edit mode', async ({ page }) => {
      const tagName = `tag-remove-${Date.now()}`;

      // Create and assign the tag
      let card = await openEditMode(page, slug);
      await createTagInEditMode(page, card, tagName);
      await card.locator('button:has-text("保存")').click();
      await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

      // Re-enter edit mode
      card = await openEditMode(page, slug);

      // Click the remove button on the tag badge in the edit area
      const editArea = card.locator('[data-testid="edit-area"]');
      const tagBadge = editArea.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`);
      await expect(tagBadge).toBeVisible({ timeout: 3_000 });
      await tagBadge.locator(`button[aria-label="Remove tag ${tagName}"]`).click();

      // Tag badge should disappear from edit area
      await expect(tagBadge).toBeHidden({ timeout: 3_000 });

      // Save
      await card.locator('button:has-text("保存")').click();
      await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

      // Verify tag is gone from the card
      await expect(
        card.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
      ).toBeHidden();
    });

    test('multiple tags are displayed on a link card', async ({ page }) => {
      const tag1 = `multi-a-${Date.now()}`;
      const tag2 = `multi-b-${Date.now()}`;

      const card = await openEditMode(page, slug);
      await createTagInEditMode(page, card, tag1);
      await createTagInEditMode(page, card, tag2);
      await card.locator('button:has-text("保存")').click();
      await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

      // Both tag badges visible on the card
      await expect(card.locator(`[data-testid="tag-badge"][data-tag-name="${tag1}"]`)).toBeVisible();
      await expect(card.locator(`[data-testid="tag-badge"][data-tag-name="${tag2}"]`)).toBeVisible();
    });
  });

  test.describe('filter by tag', () => {
    let slug1: string;
    let slug2: string;
    let tagName: string;

    test.beforeAll(async ({ browser }) => {
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

      // Create two links
      await createLink(page, 'https://example.com/filter-1', slug1);
      await createLink(page, 'https://example.com/filter-2', slug2);

      // Assign the tag only to slug1
      const card = await openEditMode(page, slug1);
      await createTagInEditMode(page, card, tagName);
      await card.locator('button:has-text("保存")').click();
      await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

      await context.close();
    });

    test('filtering by tag shows only tagged links', async ({ page }) => {
      await page.goto('/dashboard');
      await waitForLinksPage(page);

      const main = page.locator('main');

      // Both links should be visible before filtering
      await expect(main.getByText(slug1)).toBeVisible();
      await expect(main.getByText(slug2)).toBeVisible();

      // Open the tag filter popover
      await main.locator('[data-testid="tag-filter-trigger"]').click();

      // Select the tag — popover is in a portal
      const tagItem = page.locator(`[data-testid="tag-filter-item"][data-tag-name="${tagName}"]`);
      await expect(tagItem).toBeVisible({ timeout: 3_000 });
      await tagItem.click();

      // Close the popover by pressing Escape
      await page.keyboard.press('Escape');

      // Active filter badge should appear
      await expect(
        main.locator(`[data-testid="active-tag-filter"][data-tag-name="${tagName}"]`),
      ).toBeVisible({ timeout: 3_000 });

      // slug1 (tagged) should be visible, slug2 (untagged) should not
      await expect(main.getByText(slug1)).toBeVisible();
      await expect(main.getByText(slug2)).toBeHidden({ timeout: 5_000 });

      // The filtered count should show (e.g. "1 / N 条链接")
      await expect(main.getByText(/\d+ \/ \d+ 条链接/)).toBeVisible();
    });

    test('clearing tag filter restores all links', async ({ page }) => {
      await page.goto('/dashboard');
      await waitForLinksPage(page);

      const main = page.locator('main');

      // Apply tag filter
      await main.locator('[data-testid="tag-filter-trigger"]').click();
      const tagItem = page.locator(`[data-testid="tag-filter-item"][data-tag-name="${tagName}"]`);
      await tagItem.click();
      await page.keyboard.press('Escape');

      // Verify filter is active (slug2 hidden)
      await expect(main.getByText(slug2)).toBeHidden({ timeout: 5_000 });

      // Click "清除筛选" to clear
      await main.locator('[data-testid="clear-filters"]').click();

      // Both links should be visible again
      await expect(main.getByText(slug1)).toBeVisible({ timeout: 5_000 });
      await expect(main.getByText(slug2)).toBeVisible({ timeout: 5_000 });
    });

    test('remove active tag filter badge deselects the tag', async ({ page }) => {
      await page.goto('/dashboard');
      await waitForLinksPage(page);

      const main = page.locator('main');

      // Apply tag filter
      await main.locator('[data-testid="tag-filter-trigger"]').click();
      const tagItem = page.locator(`[data-testid="tag-filter-item"][data-tag-name="${tagName}"]`);
      await tagItem.click();
      await page.keyboard.press('Escape');

      // Verify filter is active
      const activeBadge = main.locator(`[data-testid="active-tag-filter"][data-tag-name="${tagName}"]`);
      await expect(activeBadge).toBeVisible({ timeout: 3_000 });
      await expect(main.getByText(slug2)).toBeHidden({ timeout: 5_000 });

      // Click the X on the active tag filter badge
      await activeBadge.locator(`button[aria-label="Remove filter ${tagName}"]`).click();

      // Badge should disappear and both links visible
      await expect(activeBadge).toBeHidden({ timeout: 3_000 });
      await expect(main.getByText(slug1)).toBeVisible({ timeout: 5_000 });
      await expect(main.getByText(slug2)).toBeVisible({ timeout: 5_000 });
    });

    test('tag filter shows count in trigger button', async ({ page }) => {
      await page.goto('/dashboard');
      await waitForLinksPage(page);

      const main = page.locator('main');
      const trigger = main.locator('[data-testid="tag-filter-trigger"]');

      // Before filtering: trigger shows "标签"
      await expect(trigger).toHaveText('标签');

      // Apply filter
      await trigger.click();
      const tagItem = page.locator(`[data-testid="tag-filter-item"][data-tag-name="${tagName}"]`);
      await tagItem.click();
      await page.keyboard.press('Escape');

      // After filtering: trigger shows "标签 (1)"
      await expect(trigger).toHaveText('标签 (1)');
    });
  });
});
