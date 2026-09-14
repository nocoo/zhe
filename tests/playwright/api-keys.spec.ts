/**
 * E2E: API Keys — create, view, and revoke API keys.
 *
 * Tests run against the real D1 database. The global-setup ensures
 * the E2E test user exists. Each test creates its own data and
 * cleans up via beforeAll to avoid cross-spec pollution.
 */
import { expect, test } from "./fixtures";
import { executeD1, queryD1, TEST_USER } from "./helpers/d1";

/** Helper: wait for API Keys page to finish loading. */
async function waitForApiKeysPage(page: import("@playwright/test").Page): Promise<void> {
  await page.locator('[data-testid="api-keys-section"]').waitFor({ timeout: 15_000 });
}

test.describe("API Keys", () => {
  // Clean up any existing API keys before tests
  test.beforeAll(async () => {
    await executeD1("DELETE FROM api_keys WHERE user_id = ?", [TEST_USER.id]);
  });

  test.afterAll(async () => {
    await executeD1("DELETE FROM api_keys WHERE user_id = ?", [TEST_USER.id]);
  });

  test.describe("empty state", () => {
    test("shows empty state message when no keys exist", async ({ page }) => {
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await expect(page.locator('[data-testid="no-keys-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="no-keys-message"]')).toContainText("还没有 API Key");
    });

    test("shows create button in empty state", async ({ page }) => {
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await expect(page.locator('[data-testid="show-create-form-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="show-create-form-btn"]')).toContainText(
        "创建 API Key",
      );
    });
  });

  test.describe("create key", () => {
    test.beforeEach(async () => {
      await executeD1("DELETE FROM api_keys WHERE user_id = ?", [TEST_USER.id]);
    });

    test("opens create form when clicking create button", async ({ page }) => {
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();

      const form = page.locator('[data-testid="create-form"]');
      await expect(form).toBeVisible();
      await expect(page.getByTestId("key-expiry-select")).toHaveText("永久有效");
      await expect(form).toHaveAttribute("data-basalt-surface", "");
      const nameInput = page.locator('[data-testid="key-name-input"]');
      await expect(nameInput).toBeVisible();
      await expect
        .poll(async () => nameInput.evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(await form.evaluate((el) => getComputedStyle(el).backgroundColor));
    });

    test("create button is disabled when name is empty", async ({ page }) => {
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      // Select a scope but leave name empty
      await page.locator('[data-testid="scope-links:read"]').click();

      await expect(page.locator('[data-testid="create-key-btn"]')).toBeDisabled();
    });

    test("create button is disabled when no scopes selected", async ({ page }) => {
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      // Enter name but don't select any scope
      await page.locator('[data-testid="key-name-input"]').fill("Test Key");

      await expect(page.locator('[data-testid="create-key-btn"]')).toBeDisabled();
    });

    test("can cancel create form", async ({ page }) => {
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await expect(page.locator('[data-testid="create-form"]')).toBeVisible();
      await page.getByTestId("key-expiry-select").click();
      await page.getByRole("option", { name: "1 天", exact: true }).click();

      await page.locator('[data-testid="cancel-create-btn"]').click();

      await expect(page.locator('[data-testid="create-form"]')).toBeHidden();
      await expect(page.locator('[data-testid="show-create-form-btn"]')).toBeVisible();
      await page.getByTestId("show-create-form-btn").click();
      await expect(page.getByTestId("key-expiry-select")).toHaveText("永久有效");
    });

    test("creates API key with name and scopes", async ({ page }) => {
      const keyName = `E2E Test Key ${Date.now()}`;

      await page.goto("/dashboard/api-keys");
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
      const [key] = await queryD1<{ expires_at: number | null }>(
        "SELECT expires_at FROM api_keys WHERE user_id=? AND name=?",
        [TEST_USER.id, keyName],
      );
      expect(key?.expires_at).toBeNull();
      await expect(page.getByTestId("keys-list")).toContainText("永久有效");
    });

    for (const days of [30, 7, 3, 1]) {
      test(`persists an explicitly selected ${days}-day lifetime and resets the next form`, async ({
        page,
      }) => {
        const name = `E2E ${days}-day Key`;
        await page.goto("/dashboard/api-keys");
        await waitForApiKeysPage(page);
        await page.getByTestId("show-create-form-btn").click();
        await page.getByTestId("key-name-input").fill(name);
        await page.getByTestId("scope-connector:write").click();
        await page.getByTestId("key-expiry-select").click();
        await expect(page.getByRole("option")).toHaveText([
          "永久有效",
          "30 天",
          "7 天",
          "3 天",
          "1 天",
        ]);
        await page.getByRole("option", { name: `${days} 天`, exact: true }).click();
        await page.getByTestId("create-key-btn").click();
        await expect(page.getByTestId("new-key-banner")).toBeVisible();
        const [key] = await queryD1<{ created_at: number; expires_at: number }>(
          "SELECT created_at,expires_at FROM api_keys WHERE user_id=? AND name=?",
          [TEST_USER.id, name],
        );
        expect(key).toBeDefined();
        const lifetime = (key?.expires_at ?? 0) - (key?.created_at ?? 0);
        expect(lifetime).toBeGreaterThanOrEqual(days * 86400 - 1);
        expect(lifetime).toBeLessThanOrEqual(days * 86400);
        await page.getByTestId("show-create-form-btn").click();
        await expect(page.getByTestId("key-expiry-select")).toHaveText("永久有效");
        await page.reload();
        await waitForApiKeysPage(page);
        await expect(page.getByTestId("keys-list")).toContainText("有效至");
      });
    }

    test("shows newly created key value with copy button", async ({ page }) => {
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill("Copy Test Key");
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();

      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="copy-new-key-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="dismiss-new-key-btn"]')).toBeVisible();
    });

    test("can dismiss new key banner", async ({ page }) => {
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill("Dismiss Test Key");
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();

      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });

      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      await expect(page.locator('[data-testid="new-key-banner"]')).toBeHidden();
    });
  });

  test.describe("revoke key", () => {
    test.beforeEach(async () => {
      await executeD1("DELETE FROM api_keys WHERE user_id = ?", [TEST_USER.id]);
    });

    test("shows revoke confirmation dialog", async ({ page }) => {
      // First create a key
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill("Key to Revoke");
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      // Click revoke button
      await page.locator('button:has-text("撤销")').click();

      // Verify dialog appears
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page.getByText("撤销 API Key")).toBeVisible();
      await expect(page.getByText("此操作不可撤消")).toBeVisible();
    });

    test("can cancel revoke dialog", async ({ page }) => {
      // First create a key
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill("Key Cancel Revoke");
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      // Open and cancel dialog
      await page.locator('button:has-text("撤销")').click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page.getByRole("button", { name: "取消" }).click();

      // Dialog should close, key should still exist
      await expect(page.getByRole("alertdialog")).toBeHidden();
      await expect(page.getByText("Key Cancel Revoke")).toBeVisible();
    });

    test("revokes key when confirmed", async ({ page }) => {
      const keyName = `Key to Delete ${Date.now()}`;

      // First create a key
      await page.goto("/dashboard/api-keys");
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
      await page.getByRole("alertdialog").getByRole("button", { name: "撤销" }).click();

      // Key should be removed from list
      await expect(page.getByText(keyName)).toBeHidden({ timeout: 10_000 });
    });
  });

  test.describe("key display", () => {
    test.beforeEach(async () => {
      await executeD1("DELETE FROM api_keys WHERE user_id = ?", [TEST_USER.id]);
    });

    test("displays key prefix, name, and scopes", async ({ page }) => {
      // Create a key with multiple scopes
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill("Display Test Key");
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="scope-links:write"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      // Verify display elements
      await expect(page.getByText("Display Test Key")).toBeVisible();
      // Key prefix (e.g., "zhe_...")
      await expect(page.locator('code:has-text("...")')).toBeVisible();
      // Scope badges
      await expect(page.locator('[data-testid="keys-list"]')).toContainText("links:read");
      await expect(page.locator('[data-testid="keys-list"]')).toContainText("links:write");
    });

    test("displays creation date", async ({ page }) => {
      await page.goto("/dashboard/api-keys");
      await waitForApiKeysPage(page);

      await page.locator('[data-testid="show-create-form-btn"]').click();
      await page.locator('[data-testid="key-name-input"]').fill("Date Test Key");
      await page.locator('[data-testid="scope-links:read"]').click();
      await page.locator('[data-testid="create-key-btn"]').click();
      await expect(page.locator('[data-testid="new-key-banner"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-testid="dismiss-new-key-btn"]').click();

      // Verify date display
      await expect(page.getByText(/创建于/)).toBeVisible();
      await expect(page.getByText("从未使用")).toBeVisible();
    });
  });
});
