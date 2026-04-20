/**
 * Shared helpers for tag-related E2E specs (tags-create + tags-filter).
 */
import { expect, type Page, type Locator } from '@playwright/test';

/** Wait for link-list page to finish loading inside <main>. */
export async function waitForLinksPage(page: Page): Promise<void> {
  await page.locator('main').getByRole('button', { name: '刷新链接' }).waitFor({ timeout: 15_000 });
}

/** Create a link via UI. */
export async function createLink(page: Page, url: string, slug: string): Promise<void> {
  const main = page.locator('main');
  await main.getByRole('button', { name: '新建链接' }).first().click();
  await page.locator('button:has-text("自定义 slug")').click();
  await page.locator('#url').fill(url);
  await page.locator('#slug').fill(slug);
  await page.locator('button:has-text("创建链接")').click();
  await expect(page.getByText('创建短链接')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(slug)).toBeVisible({ timeout: 10_000 });
}

/** Enter edit mode for a link card identified by slug text. */
export async function openEditMode(page: Page, slug: string): Promise<Locator> {
  const card = page.locator(`[data-testid="link-card"]:has-text("${slug}")`).first();
  await card.getByRole('button', { name: 'Edit link' }).first().click();
  await expect(card.locator('[data-testid="edit-area"]')).toBeVisible({ timeout: 10_000 });
  return card;
}

/**
 * Create a tag via the TagPicker in edit mode.
 *
 * Note: The TagPicker popover content renders in a Radix portal outside the
 * card DOM tree, so we must locate popover elements at page level.
 */
export async function createTagInEditMode(
  page: Page,
  card: Locator,
  tagName: string,
): Promise<void> {
  await card.locator('[data-testid="tag-picker-trigger"]').click();

  const pickerInput = page.locator('[cmdk-input]').last();
  await pickerInput.fill(tagName);

  const createOption = page.locator('[data-testid="tag-create-option"]');
  await expect(createOption).toBeVisible({ timeout: 10_000 });
  await createOption.click();

  // Wait for the popover to close and tag to appear in edit area
  // CI environment is slower, so increase timeout significantly
  const editArea = card.locator('[data-testid="edit-area"]');
  await expect(
    editArea.locator(`[data-testid="tag-badge"][data-tag-name="${tagName}"]`),
  ).toBeVisible({ timeout: 30_000 });
}
