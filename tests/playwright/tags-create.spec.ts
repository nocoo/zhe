/**
 * E2E: Tag UI — create tags, assign to links, verify display.
 *
 * Split from tags.spec.ts to allow file-level parallelism (Playwright runs
 * separate spec files in different workers when fullyParallel:false but
 * workers > 1). Each test creates its own data; global-teardown cleans up.
 */
import { test, expect } from './fixtures';
import {
  waitForLinksPage,
  createLink,
  openEditMode,
  createTagInEditMode,
} from './helpers/tags';

test.describe('Tag UI - create and display', () => {
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

    await card.locator('button:has-text("保存")').click();
    await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

    await expect(
      card.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('remove a tag from a link in edit mode', async ({ page }) => {
    const tagName = `tag-remove-${Date.now()}`;

    let card = await openEditMode(page, slug);
    await createTagInEditMode(page, card, tagName);
    await card.locator('button:has-text("保存")').click();
    await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

    card = await openEditMode(page, slug);

    const editArea = card.locator('[data-testid="edit-area"]');
    const tagBadge = editArea.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`);
    await expect(tagBadge).toBeVisible({ timeout: 3_000 });
    await tagBadge.locator(`button[aria-label="Remove tag ${tagName}"]`).click();

    await expect(tagBadge).toBeHidden({ timeout: 3_000 });

    await card.locator('button:has-text("保存")').click();
    await expect(card.locator('[data-testid="edit-area"]')).toBeHidden({ timeout: 10_000 });

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

    await expect(card.locator(`[data-testid="tag-badge"][data-tag-name="${tag1}"]`)).toBeVisible();
    await expect(card.locator(`[data-testid="tag-badge"][data-tag-name="${tag2}"]`)).toBeVisible();
  });
});
