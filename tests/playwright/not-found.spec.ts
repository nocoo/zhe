/**
 * E2E: 404 page rendering + link expiration handling.
 *
 * Covers two related flows:
 * 1. Visiting a non-existent slug shows the 404 page.
 * 2. Visiting an expired link also shows the 404 page (middleware checks expiresAt).
 *
 * Both flows render the same not-found page (`app/not-found.tsx`)
 * via `NextResponse.rewrite('/not-found')` in middleware.
 */
import { test, expect } from './fixtures';
import { executeD1, TEST_USER } from './helpers/d1';

test.describe('404 page and link expiration', () => {
  // ── 404 page rendering ──────────────────────────────────────────

  test('non-existent slug shows 404 heading', async ({ page }) => {
    const slug = `e2e-ghost-${Date.now()}`;
    await page.goto(`/${slug}`);

    const heading = page.locator('h1');
    await expect(heading).toContainText('404', { timeout: 10_000 });
  });

  test('404 page has "返回首页" link pointing to /', async ({ page }) => {
    const slug = `e2e-nope-${Date.now()}`;
    await page.goto(`/${slug}`);

    const homeLink = page.getByRole('link', { name: '返回首页' });
    await expect(homeLink).toBeVisible({ timeout: 10_000 });
    await expect(homeLink).toHaveAttribute('href', '/');
  });

  test('"返回首页" link navigates to the landing page', async ({ page }) => {
    const slug = `e2e-back-${Date.now()}`;
    await page.goto(`/${slug}`);

    const homeLink = page.getByRole('link', { name: '返回首页' });
    await expect(homeLink).toBeVisible({ timeout: 10_000 });

    await homeLink.click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    // Authenticated user gets redirected from / to /dashboard
  });

  test('non-existent slug returns 404 via API lookup', async ({ request }) => {
    const slug = `e2e-api404-${Date.now()}`;
    const res = await request.get(`/api/lookup?slug=${slug}`);
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.found).toBe(false);
  });

  // ── Link expiration handling ────────────────────────────────────

  test('expired link shows 404 page instead of redirecting', async ({ page }) => {
    const slug = `e2e-expired-${Date.now()}`;
    const targetUrl = 'https://example.com/should-not-reach';
    const pastTimestamp = Date.now() - 3_600_000; // 1 hour ago

    // Seed an expired link directly in D1
    await executeD1(
      `INSERT INTO links (user_id, original_url, slug, is_custom, expires_at, clicks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [TEST_USER.id, targetUrl, slug, 0, pastTimestamp, 0, Date.now()],
    );

    // Visit the expired slug — should show 404, NOT redirect
    await page.goto(`/${slug}`);

    const heading = page.locator('h1');
    await expect(heading).toContainText('404', { timeout: 10_000 });
  });

  test('expired link returns 404 with expired flag via API lookup', async ({ request }) => {
    const slug = `e2e-expapi-${Date.now()}`;
    const pastTimestamp = Date.now() - 7_200_000; // 2 hours ago

    await executeD1(
      `INSERT INTO links (user_id, original_url, slug, is_custom, expires_at, clicks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [TEST_USER.id, 'https://example.com/expired', slug, 0, pastTimestamp, 0, Date.now()],
    );

    const res = await request.get(`/api/lookup?slug=${slug}`);
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.found).toBe(false);
    expect(body.expired).toBe(true);
  });

  test('non-expired link still redirects normally (control test)', async ({ request }) => {
    const slug = `e2e-valid-${Date.now()}`;
    const targetUrl = 'https://example.com/still-alive';
    const futureTimestamp = Date.now() + 86_400_000; // 24 hours from now

    await executeD1(
      `INSERT INTO links (user_id, original_url, slug, is_custom, expires_at, clicks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [TEST_USER.id, targetUrl, slug, 0, futureTimestamp, 0, Date.now()],
    );

    // Should redirect normally
    const res = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toBe(targetUrl);
  });

  test('link with no expiration never expires (null expiresAt)', async ({ request }) => {
    const slug = `e2e-noexp-${Date.now()}`;
    const targetUrl = 'https://example.com/forever';

    await executeD1(
      `INSERT INTO links (user_id, original_url, slug, is_custom, expires_at, clicks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [TEST_USER.id, targetUrl, slug, 0, null, 0, Date.now()],
    );

    const res = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toBe(targetUrl);
  });
});
