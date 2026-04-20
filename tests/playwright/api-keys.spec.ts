/**
 * E2E: API Keys — create, view, and revoke API keys.
 *
 * Tests run against the real D1 database. The global-setup ensures
 * the E2E test user exists. Each test creates its own data and
 * cleans up via beforeAll to avoid cross-spec pollution.
 */
import { test, expect } from './fixtures';
import { executeD1, TEST_USER } from './helpers/d1';

/** Helper: wait for API Keys page to finish loading. */
async function waitForApiKeysPage(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-testid="api-keys-section"]').waitFor({ timeout: 15_000 });
}

test.describe('API Keys', () => {
  // Clean up any existing API keys before tests
  test.beforeAll(async () => {
    await executeD1('DELETE FROM api_keys WHERE user_id = ?', [TEST_USER.id]);
  });

  test.afterAll(async () => {
    await executeD1('DELETE FROM api_keys WHERE user_id = ?', [TEST_USER.id]);
  });

  test.describe('empty state', () => {
    test('shows empty state message when no keys exist', async ({ page }) => {
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await expect(page.locator('[data-testid="no-keys-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="no-keys-message"]')).toContainText('还没有 API Key');
    });

    test('shows create button in empty state', async ({ page }) => {
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await expect(page.locator('[data-testid="show-create-form-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="show-create-form-btn"]')).toContainText('创建 API Key');
    });
  });

  test.describe('create key', () => {
    test.beforeEach(async () => {
      await executeD1('DELETE FROM api_keys WHERE user_id = ?', [TEST_USER.id]);
    });

    test('opens create form when clicking create button', async ({ page }) => {
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();

      await expect(page.locator('[data-testid="create-form"]')).toBeVisible();
      await expect(page.locator('[data-testid="key-name-input"]')).toBeVisible();
    });

    test('create button is disabled when name is empty', async ({ page }) => {
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      // Select a scope but leave name empty
      await page.locator('[data-testid="scope-links:read"]').click();

      await expect(page.locator('[data-testid="create-key-btn"]')).toBeDisabled();
    });

    test('create button is disabled when no scopes selected', async ({ page }) => {
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      // Enter name but don't select any scope
      await page.locator('[data-testid="key-name-input"]').fill('Test Key');

      await expect(page.locator('[data-testid="create-key-btn"]')).toBeDisabled();
    });

    test('can cancel create form', async ({ page }) => {
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await expect(page.locator('[data-testid="create-form"]')).toBeVisible();

      await page.locator('[data-testid="cancel-create-btn"]').click();

      await expect(page.locator('[data-testid="create-form"]')).toBeHidden();
      await expect(page.locator('[data-testid="show-create-form-btn"]')).toBeVisible();
    });

    test('creates API key with name and scopes', async ({ page }) => {
      const keyName = `E2E Test Key ${Date.now()}`;

      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      // Open create form
      await page.locator('[data-testid="show-create-form-btn"]').click();

      // Fill form
      await page.locator('[data-testid="key-name-input"]').fill(keyName);
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="scope-links:write"]').click();

      // Submit
      await page.locator('[data-testid="create-key-btn"]').click();

      // Wait for new key banner to appear
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="new-key-value"]')).toBeVisible();

      // Verify key appears in list
      await expect(page.getByText(keyName)).toBeVisible();
    });

    test('shows newly created key value with copy button', async ({ page }) => {
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill('Copy Test Key');
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();

      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="copy-new-key-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="dismiss-new-key-btn"]')).toBeVisible();
    });

    test('can dismiss new key banner', async ({ page }) => {
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill('Dismiss Test Key');
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();

      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });

      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      await expect(page.locator('[data-testid="new-key-banner"]')).toBeHidden();
    });
  });

  test.describe('revoke key', () => {
    test.beforeEach(async () => {
      await executeD1('DELETE FROM api_keys WHERE user_id = ?', [TEST_USER.id]);
    });

    test('shows revoke confirmation dialog', async ({ page }) => {
      // First create a key
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill('Key to Revoke');
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      // Click revoke button
      await page.locator('button:has-text("撤销")').click();

      // Verify dialog appears
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expect(page.getByText('撤销 API Key')).toBeVisible();
      await expect(page.getByText('此操作不可撤消')).toBeVisible();
    });

    test('can cancel revoke dialog', async ({ page }) => {
      // First create a key
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill('Key Cancel Revoke');
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      // Open and cancel dialog
      await page.locator('button:has-text("撤销")').click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await page.getByRole('button', { name: '取消' }).click();

      // Dialog should close, key should still exist
      await expect(page.getByRole('alertdialog')).toBeHidden();
      await expect(page.getByText('Key Cancel Revoke')).toBeVisible();
    });

    test('revokes key when confirmed', async ({ page }) => {
      const keyName = `Key to Delete ${Date.now()}`;

      // First create a key
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill(keyName);
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      // Confirm key exists
      await expect(page.getByText(keyName)).toBeVisible();

      // Revoke the key
      await page.locator('button:has-text("撤销")').click();
      await page.getByRole('alertdialog').getByRole('button', { name: '撤销' }).click();

      // Key should be removed from list
      await expect(page.getByText(keyName)).toBeHidden({ timeout: 10_000 });
    });
  });

  test.describe('key display', () => {
    test.beforeEach(async () => {
      await executeD1('DELETE FROM api_keys WHERE user_id = ?', [TEST_USER.id]);
    });

    test('displays key prefix, name, and scopes', async ({ page }) => {
      // Create a key with multiple scopes
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill('Display Test Key');
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="scope-links:write"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      // Verify display elements
      await expect(page.getByText('Display Test Key')).toBeVisible();
      // Key prefix (e.g., "zhe_...")
      await expect(page.locator('code:has-text("...")')).toBeVisible();
      // Scope badges
      await expect(page.locator('[data-testid="keys-list"]')).toContainText('links:read');
      await expect(page.locator('[data-testid="keys-list"]')).toContainText('links:write');
    });

    test('displays creation date', async ({ page }) => {
      await page.goto('/dashboard/api-keys');
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill('Date Test Key');
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      // Verify date display
      await expect(page.getByText(/创建于/)).toBeVisible();
      await expect(page.getByText('从未使用')).toBeVisible();
    });
  });
});
