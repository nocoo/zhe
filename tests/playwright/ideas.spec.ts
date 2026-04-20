/**
 * E2E: Ideas — create, view, edit, search, filter, and delete ideas.
 *
 * Tests run against the real D1 database. The global-setup ensures
 * the E2E test user exists. Each test creates its own data and
 * cleans up via beforeAll to avoid cross-spec pollution.
 */
import { test, expect } from './fixtures';
import { executeD1, TEST_USER } from './helpers/d1';

/** Helper: wait for Ideas page to finish loading. */
async function waitForIdeasPage(page: import('@playwright/test').Page): Promise<void> {
  // Wait for the page header "想法" to be visible
  await page.getByRole('heading', { name: '想法' }).waitFor({ timeout: 30_000 });
  // Wait for skeleton to disappear (loading complete)
  await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Ideas', () => {
  // Clean up any existing ideas before tests
  test.beforeAll(async () => {
    await executeD1('DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)', [TEST_USER.id]);
    await executeD1('DELETE FROM ideas WHERE user_id = ?', [TEST_USER.id]);
  });

  test.afterAll(async () => {
    await executeD1('DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)', [TEST_USER.id]);
    await executeD1('DELETE FROM ideas WHERE user_id = ?', [TEST_USER.id]);
  });

  test.describe('empty state', () => {
    test.beforeEach(async () => {
      await executeD1('DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)', [TEST_USER.id]);
      await executeD1('DELETE FROM ideas WHERE user_id = ?', [TEST_USER.id]);
    });

    test('shows empty state message when no ideas exist', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await expect(page.getByText('暂无想法')).toBeVisible();
      await expect(page.getByText('点击上方按钮记录您的第一个想法')).toBeVisible();
    });

    test('shows create button in header', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      // Empty state shows two create buttons (header + empty-state), verify at least one
      await expect(page.getByRole('button', { name: '新想法' }).first()).toBeVisible();
    });
  });

  test.describe('create idea', () => {
    test.beforeEach(async () => {
      await executeD1('DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)', [TEST_USER.id]);
      await executeD1('DELETE FROM ideas WHERE user_id = ?', [TEST_USER.id]);
    });

    test('opens create modal when clicking create button', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      // Use .first() because empty state shows two create buttons
      await page.getByRole('button', { name: '新想法' }).first().click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('新想法', { exact: false })).toBeVisible();
      await expect(page.locator('#new-content')).toBeVisible();
    });

    test('create button is disabled when content is empty', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();

      // Title is optional, but content is required
      await page.locator('#new-title').fill('Test Title');

      await expect(page.getByRole('dialog').getByRole('button', { name: '创建' })).toBeDisabled();
    });

    test('can cancel create modal', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await page.getByRole('button', { name: '取消' }).click();

      await expect(page.getByRole('dialog')).toBeHidden();
    });

    test('creates idea with content only', async ({ page }) => {
      const content = `Test idea content ${Date.now()}`;

      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await page.locator('#new-content').fill(content);
      await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();

      // Wait for modal to close
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

      // Verify idea appears in list
      await expect(page.getByText(content)).toBeVisible({ timeout: 10_000 });
    });

    test('creates idea with title and content', async ({ page }) => {
      const title = `Test Title ${Date.now()}`;
      const content = 'Test content for titled idea';

      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await page.locator('#new-title').fill(title);
      await page.locator('#new-content').fill(content);
      await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();

      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
      await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('view modes', () => {
    test.beforeAll(async () => {
      // Create a test idea for view mode tests
      await executeD1('DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)', [TEST_USER.id]);
      await executeD1('DELETE FROM ideas WHERE user_id = ?', [TEST_USER.id]);
      await executeD1(
        'INSERT INTO ideas (user_id, content, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
        [TEST_USER.id, 'View mode test idea'],
      );
    });

    test('can switch to grid view', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: 'Grid view' }).click();

      // In grid view, ideas are displayed in a grid with 4 columns at xl breakpoint
      await expect(page.locator('.grid.grid-cols-1')).toBeVisible();
    });

    test('can switch to list view', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: 'List view' }).click();

      // In list view, ideas are displayed in a vertical list with space-y-2
      await expect(page.locator('main .space-y-2')).toBeVisible();
    });
  });

  test.describe('search', () => {
    test.beforeAll(async () => {
      await executeD1('DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)', [TEST_USER.id]);
      await executeD1('DELETE FROM ideas WHERE user_id = ?', [TEST_USER.id]);
      // Create test ideas
      await executeD1(
        'INSERT INTO ideas (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))',
        [TEST_USER.id, 'Apple Idea', 'Content about apples'],
      );
      await executeD1(
        'INSERT INTO ideas (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))',
        [TEST_USER.id, 'Banana Idea', 'Content about bananas'],
      );
    });

    test('filters ideas by search query', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      // Search for "Apple"
      await page.getByPlaceholder('搜索想法...').fill('Apple');

      // Should show only Apple idea
      await expect(page.getByText('Apple Idea')).toBeVisible();
      await expect(page.getByText('Banana Idea')).toBeHidden();
    });

    test('shows filtered count', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByPlaceholder('搜索想法...').fill('Apple');

      // Should show "1 / 2 条想法"
      await expect(page.getByText(/1 \/ 2 条想法/)).toBeVisible();
    });

    test('can clear search', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByPlaceholder('搜索想法...').fill('Apple');
      await expect(page.getByText('Banana Idea')).toBeHidden();

      // Click clear button (X)
      await page.locator('input[placeholder="搜索想法..."] + button').click();

      // Both ideas should be visible again
      await expect(page.getByText('Apple Idea')).toBeVisible();
      await expect(page.getByText('Banana Idea')).toBeVisible();
    });
  });

  test.describe('delete idea', () => {
    test.beforeEach(async () => {
      await executeD1('DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)', [TEST_USER.id]);
      await executeD1('DELETE FROM ideas WHERE user_id = ?', [TEST_USER.id]);
    });

    test('shows delete confirmation dialog', async ({ page }) => {
      // Create an idea first
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await page.locator('#new-content').fill('Idea to delete');
      await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

      // Open context menu and click delete
      // Hover over the idea card to show action buttons
      await page.getByText('Idea to delete').hover();
      await page.getByRole('button', { name: '删除' }).click();

      // Verify dialog
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('删除想法')).toBeVisible();
      await expect(page.getByText('此操作无法撤销')).toBeVisible();
    });

    test('can cancel delete dialog', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await page.locator('#new-content').fill('Idea to keep');
      await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

      await page.getByText('Idea to keep').hover();
      await page.getByRole('button', { name: '删除' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Cancel
      await page.getByRole('button', { name: '取消' }).click();

      // Dialog closes, idea still exists
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByText('Idea to keep')).toBeVisible();
    });

    test('deletes idea when confirmed', async ({ page }) => {
      const content = `Idea to delete ${Date.now()}`;

      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await page.locator('#new-content').fill(content);
      await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
      await expect(page.getByText(content)).toBeVisible();

      // Delete
      await page.getByText(content).hover();
      await page.getByRole('button', { name: '删除' }).click();
      await page.getByRole('dialog').getByRole('button', { name: '删除' }).click();

      // Idea should be removed
      await expect(page.getByText(content)).toBeHidden({ timeout: 10_000 });
    });
  });

  test.describe('edit idea', () => {
    test.beforeEach(async () => {
      await executeD1('DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)', [TEST_USER.id]);
      await executeD1('DELETE FROM ideas WHERE user_id = ?', [TEST_USER.id]);
    });

    test('navigates to editor page when clicking idea', async ({ page }) => {
      // Create an idea
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await page.locator('#new-content').fill('Idea to edit');
      await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

      // Wait for idea to appear in list
      await expect(page.getByText('Idea to edit')).toBeVisible({ timeout: 10_000 });

      // Click on the idea card
      await page.getByText('Idea to edit').click();

      // Should navigate to editor page
      await expect(page).toHaveURL(/\/dashboard\/ideas\/\d+/, { timeout: 10_000 });
      // Editor should show the content
      await expect(page.getByText('编辑', { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('预览')).toBeVisible();
    });

    test('editor shows back button', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await page.locator('#new-content').fill('Idea for back button test');
      await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

      // Wait for idea to appear in list before clicking
      await expect(page.getByText('Idea for back button test')).toBeVisible({ timeout: 10_000 });
      await page.getByText('Idea for back button test').click();
      await expect(page).toHaveURL(/\/dashboard\/ideas\/\d+/, { timeout: 15_000 });

      // Wait for editor to load - must wait for back button to be visible
      await expect(page.getByText('编辑', { exact: true })).toBeVisible({ timeout: 15_000 });
      const backButton = page.getByRole('button', { name: '返回想法列表' });
      await expect(backButton).toBeVisible({ timeout: 15_000 });

      // Click back button
      await backButton.click();

      // Should go back to ideas list
      await expect(page).toHaveURL('/dashboard/ideas', { timeout: 15_000 });
    });

    test('can edit idea content and save', async ({ page }) => {
      const originalContent = `Original content ${Date.now()}`;

      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await page.locator('#new-content').fill(originalContent);
      await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

      // Wait for idea to appear in list before clicking
      await expect(page.getByText(originalContent)).toBeVisible({ timeout: 10_000 });

      // Navigate to editor
      await page.getByText(originalContent).click();
      await expect(page).toHaveURL(/\/dashboard\/ideas\/\d+/, { timeout: 15_000 });

      // Wait for editor to fully load with original content
      await expect(page.getByText('编辑', { exact: true })).toBeVisible({ timeout: 15_000 });
      const textarea = page.locator('textarea');
      await expect(textarea).toHaveValue(originalContent, { timeout: 15_000 });

      // Verify editor has preview panel
      await expect(page.getByText('预览')).toBeVisible();
      // Preview shows the content
      await expect(page.locator('main').getByText(originalContent)).toHaveCount(2); // textarea + preview

      // Wait for back button before clicking
      const backButton = page.getByRole('button', { name: '返回想法列表' });
      await expect(backButton).toBeVisible({ timeout: 15_000 });

      // Go back to verify navigation works
      await backButton.click();
      await expect(page).toHaveURL('/dashboard/ideas', { timeout: 15_000 });
      await expect(page.getByText(originalContent)).toBeVisible();
    });

    test('shows unsaved indicator when content is dirty', async ({ page }) => {
      await page.goto('/dashboard/ideas');
      await waitForIdeasPage(page);

      await page.getByRole('button', { name: '新想法' }).first().click();
      await page.locator('#new-content').fill('Content for dirty test');
      await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

      await page.getByText('Content for dirty test').click();
      await expect(page).toHaveURL(/\/dashboard\/ideas\/\d+/);

      // Modify content
      await page.locator('textarea').fill('Modified content');

      // Should show "未保存" indicator
      await expect(page.getByText('未保存')).toBeVisible();
    });

    test('shows not found state for non-existent idea', async ({ page }) => {
      await page.goto('/dashboard/ideas/999999');

      await expect(page.getByText('未找到想法')).toBeVisible();
      await expect(page.getByText('该想法不存在或已被删除')).toBeVisible();
      await expect(page.getByRole('button', { name: '返回想法列表' })).toBeVisible();
    });
  });
});
