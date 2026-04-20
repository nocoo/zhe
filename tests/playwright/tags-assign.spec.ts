/**
 * E2E: Tag UI — assign an existing tag to a different link.
 *
 * Split out from tags-create.spec.ts because this single test ran ~8s
 * (creates 2 links + creates tag + reuses it via TagPicker), forming the
 * single longest test in the L3 suite. Putting it in its own file lets
 * Playwright distribute it to a separate worker so it overlaps with the
 * other tags-create tests instead of running serially after them.
 */
import { test, expect } from './fixtures';
import {
  waitForLinksPage,
  createLink,
  openEditMode,
  createTagInEditMode,
} from './helpers/tags';

test.describe('Tag UI - assign existing', () => {
  let slug: string;

  test.beforeEach(async ({ page }) => {
    slug = `e2e-tagasn-${Date.now()}`;
    await page.goto('/dashboard');
    await waitForLinksPage(page);
    await createLink(page, 'https://example.com/tag-test', slug);
  });

  test('assign an existing tag to a link', async ({ page }) => {
    const tagName = `tag-existing-${Date.now()}`;

    let card = await openEditMode(page, slug);
    await createTagInEditMode(page, card, tagName);
    await card.locator('button:has-text("保存")').click({ force: true });
    await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 30_000 });

    const slug2 = `e2e-tagasn2-${Date.now()}`;
    await createLink(page, 'https://example.com/tag-test-2', slug2);

    card = await openEditMode(page, slug2);

    await card.locator('[data-testid="tag-picker-trigger"]').click();
    const pickerInput = page.locator('[cmdk-input]').last();
    await pickerInput.fill(tagName);

    const tagItem = page.locator(`[cmdk-item]:has-text("${tagName}")`).first();
    await expect(tagItem).toBeVisible({ timeout: 10_000 });
    await tagItem.click();

    await expect(
      card.locator('[data-testid="edit-area"]').locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
    ).toBeVisible({ timeout: 10_000 });

    await card.locator('button:has-text("保存")').click({ force: true });
    await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 30_000 });

    await expect(
      card.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
    ).toBeVisible({ timeout: 10_000 });
  });
});
