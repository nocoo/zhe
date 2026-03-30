/**
 * E2E: Overview page — stat cards, top links, section rendering.
 *
 * Seeds links + analytics + uploads directly into D1 via the HTTP API
 * in beforeAll, then navigates to /dashboard/overview and verifies
 * the rendered stats match the seeded data.
 *
 * Global teardown cleans up all test user data (links cascade to analytics).
 */
import { resolve } from 'path';
import { test, expect } from './fixtures';
import { loadEnvFile, executeD1, queryD1, TEST_USER } from './helpers/d1';

// Seed data constants
const SLUG_A = `e2e-ov-a-${Date.now()}`;
const SLUG_B = `e2e-ov-b-${Date.now()}`;
const SLUG_C = `e2e-ov-c-${Date.now()}`;
const NOW = Date.now();

test.describe('Overview page', () => {
  // Seed links, analytics, and uploads directly into D1 before all tests
  test.beforeAll(async () => {
    loadEnvFile(resolve(process.cwd(), '.env.local'));

    // Seed 3 links with different click counts
    await executeD1(
      'INSERT INTO links (user_id, original_url, slug, is_custom, clicks, created_at) VALUES (?, ?, ?, 1, ?, ?)',
      [TEST_USER.id, 'https://example.com/overview-a', SLUG_A, 15, NOW],
    );
    await executeD1(
      'INSERT INTO links (user_id, original_url, slug, is_custom, clicks, created_at) VALUES (?, ?, ?, 1, ?, ?)',
      [TEST_USER.id, 'https://example.com/overview-b', SLUG_B, 8, NOW],
    );
    await executeD1(
      'INSERT INTO links (user_id, original_url, slug, is_custom, clicks, created_at) VALUES (?, ?, ?, 1, ?, ?)',
      [TEST_USER.id, 'https://example.com/overview-c', SLUG_C, 3, NOW],
    );

    // Get link IDs for analytics seeding
    const links = await queryD1<{ id: number; slug: string }>(
      'SELECT id, slug FROM links WHERE user_id = ? AND slug IN (?, ?, ?)',
      [TEST_USER.id, SLUG_A, SLUG_B, SLUG_C],
    );
    const linkIdMap = Object.fromEntries(links.map(l => [l.slug, l.id]));

    // Seed analytics rows for link A (15 clicks) with device/browser/os info
    const analyticsPromises: Promise<void>[] = [];
    const devices = ['Desktop', 'Mobile', 'Desktop', 'Desktop', 'Mobile'];
    const browsers = ['Chrome', 'Safari', 'Firefox', 'Chrome', 'Safari'];
    const oses = ['Windows', 'iOS', 'macOS', 'Windows', 'Android'];

    for (let i = 0; i < 15; i++) {
      const device = devices[i % devices.length];
      const browser = browsers[i % browsers.length];
      const os = oses[i % oses.length];
      const createdAt = NOW - i * 3600_000; // spread over hours
      analyticsPromises.push(
        executeD1(
          'INSERT INTO analytics (link_id, device, browser, os, created_at) VALUES (?, ?, ?, ?, ?)',
          [linkIdMap[SLUG_A], device, browser, os, createdAt],
        ),
      );
    }

    // Seed analytics for link B (8 clicks)
    for (let i = 0; i < 8; i++) {
      analyticsPromises.push(
        executeD1(
          'INSERT INTO analytics (link_id, device, browser, os, created_at) VALUES (?, ?, ?, ?, ?)',
          [linkIdMap[SLUG_B], 'Desktop', 'Chrome', 'Windows', NOW - i * 3600_000],
        ),
      );
    }

    // Seed analytics for link C (3 clicks)
    for (let i = 0; i < 3; i++) {
      analyticsPromises.push(
        executeD1(
          'INSERT INTO analytics (link_id, device, browser, os, created_at) VALUES (?, ?, ?, ?, ?)',
          [linkIdMap[SLUG_C], 'Mobile', 'Safari', 'iOS', NOW - i * 3600_000],
        ),
      );
    }

    await Promise.all(analyticsPromises);

    // Seed 2 uploads for image hosting stats
    await executeD1(
      'INSERT INTO uploads (user_id, key, file_name, file_type, file_size, public_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [TEST_USER.id, `e2e-upload-1-${NOW}`, 'photo.jpg', 'image/jpeg', 524288, 'https://example.com/photo.jpg', NOW],
    );
    await executeD1(
      'INSERT INTO uploads (user_id, key, file_name, file_type, file_size, public_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [TEST_USER.id, `e2e-upload-2-${NOW}`, 'doc.png', 'image/png', 262144, 'https://example.com/doc.png', NOW],
    );
  });

  test('renders all three section headings', async ({ page }) => {
    await page.goto('/dashboard/overview');

    // Wait for the overview page to load (stat cards appear)
    const main = page.locator('main');
    await main.locator('[data-testid="stat-card"]').first().waitFor({ timeout: 15_000 });

    // Verify all 3 sections are present (scoped to main to avoid dev overlay duplicates)
    await expect(main.locator('[data-testid="section-links"]').first()).toBeVisible();
    await expect(main.locator('[data-testid="section-kv"]').first()).toBeVisible();
    await expect(main.locator('[data-testid="section-uploads"]').first()).toBeVisible();
  });

  test('stat cards display non-zero link stats', async ({ page }) => {
    await page.goto('/dashboard/overview');
    const main = page.locator('main');
    await main.locator('[data-testid="stat-card"]').first().waitFor({ timeout: 15_000 });

    const linksSection = main.locator('[data-testid="section-links"]').first();

    // Total links card: should show at least 3 (our seeded links)
    const totalLinksCard = linksSection.locator('[data-testid="stat-card"][data-stat-label="总链接数"]');
    await expect(totalLinksCard).toBeVisible();
    const totalLinksValue = totalLinksCard.locator('[data-testid="stat-value"]');
    const linksText = await totalLinksValue.textContent();
    // Value should be non-zero (at least "3" from our seeded data, possibly more from other tests)
    expect(linksText).toBeTruthy();
    expect(linksText).not.toBe('0');

    // Total clicks card: should show at least 26 (15 + 8 + 3)
    const totalClicksCard = linksSection.locator('[data-testid="stat-card"][data-stat-label="总点击量"]');
    await expect(totalClicksCard).toBeVisible();
    const totalClicksValue = totalClicksCard.locator('[data-testid="stat-value"]');
    const clicksText = await totalClicksValue.textContent();
    expect(clicksText).toBeTruthy();
    expect(clicksText).not.toBe('0');
  });

  test('top links list shows seeded links ranked by clicks', async ({ page }) => {
    await page.goto('/dashboard/overview');
    await page.locator('[data-testid="stat-card"]').first().waitFor({ timeout: 15_000 });

    const topLinksList = page.locator('[data-testid="top-links-list"]').first();
    await expect(topLinksList).toBeVisible({ timeout: 10_000 });

    // Our 3 seeded links should appear in the top links
    const topItems = topLinksList.locator('[data-testid="top-link-item"]');
    const count = await topItems.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // The first item should be SLUG_A (15 clicks = highest)
    const firstItem = topItems.first();
    await expect(firstItem).toContainText(SLUG_A);
  });

  test('stat cards display upload stats', async ({ page }) => {
    await page.goto('/dashboard/overview');
    await page.locator('[data-testid="stat-card"]').first().waitFor({ timeout: 15_000 });

    const uploadsSection = page.locator('[data-testid="section-uploads"]').first();

    // Total uploads card: should show at least 2
    const totalUploadsCard = uploadsSection.locator('[data-testid="stat-card"][data-stat-label="总上传数"]');
    await expect(totalUploadsCard).toBeVisible();
    const uploadsValue = totalUploadsCard.locator('[data-testid="stat-value"]');
    const uploadsText = await uploadsValue.textContent();
    expect(uploadsText).toBeTruthy();
    expect(uploadsText).not.toBe('0');

    // Storage card: should show non-zero (524288 + 262144 = 786432 bytes ≈ 768 KB)
    const storageCard = uploadsSection.locator('[data-testid="stat-card"][data-stat-label="存储用量"]');
    await expect(storageCard).toBeVisible();
    const storageValue = storageCard.locator('[data-testid="stat-value"]');
    const storageText = await storageValue.textContent();
    expect(storageText).toBeTruthy();
    expect(storageText).not.toBe('0 B');
  });

  test('chart cards display data (not empty state)', async ({ page }) => {
    await page.goto('/dashboard/overview');
    await page.locator('[data-testid="stat-card"]').first().waitFor({ timeout: 15_000 });

    // Click trend chart should NOT show empty state
    const linksSection = page.locator('[data-testid="section-links"]').first();
    await expect(linksSection.getByText('暂无点击数据')).toBeHidden();

    // Device breakdown donut should NOT show empty state
    await expect(linksSection.getByText('暂无数据').first()).toBeHidden();

    // Upload trend chart should NOT show empty state
    const uploadsSection = page.locator('[data-testid="section-uploads"]').first();
    await expect(uploadsSection.getByText('暂无上传数据')).toBeHidden();
  });

  test('KV cache section is visible', async ({ page }) => {
    await page.goto('/dashboard/overview');
    await page.locator('[data-testid="stat-card"]').first().waitFor({ timeout: 15_000 });

    // KV section should be visible (either with data or "无法加载" message)
    const kvSection = page.locator('[data-testid="section-kv"]').first();
    await expect(kvSection).toBeVisible();

    // Should show "最近同步" and "KV 键数" labels (either as stat cards or error)
    const kvText = await kvSection.textContent();
    expect(kvText).toContain('KV 缓存');
  });

  test('navigating to overview from sidebar works', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('main').getByRole('button', { name: '刷新链接' }).waitFor({ timeout: 15_000 });

    // Click "概览" in the sidebar (use getByRole to avoid strict mode violation
    // from duplicate text — there's a breadcrumb "概览" and a nav link "概览")
    await page.locator('nav').getByRole('link', { name: '概览' }).click();

    // Should navigate to /dashboard/overview
    await expect(page).toHaveURL(/\/dashboard\/overview/);

    // Stat cards should appear
    await page.locator('[data-testid="stat-card"]').first().waitFor({ timeout: 15_000 });
    await expect(page.locator('[data-testid="section-links"]').first()).toBeVisible();
  });
});
