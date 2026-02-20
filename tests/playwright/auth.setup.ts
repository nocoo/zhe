// Auth setup: Playwright authenticates via the Credentials provider
// (activated by PLAYWRIGHT=1) and saves the session cookie for reuse.
import { test as setup, expect } from '@playwright/test';

const authFile = 'tests/playwright/.auth/user.json';

setup('authenticate', async ({ page, context }) => {
  // Step 1: Get CSRF token from the auth endpoint
  const csrfRes = await page.request.get('/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();

  // Step 2: POST to the credentials callback. This returns a 302
  // redirect with Set-Cookie for the session token. We use fetch
  // with redirect: 'manual' to capture the cookie without following
  // the redirect (which may point to a production hostname).
  const callbackRes = await page.request.post('/api/auth/callback/e2e-credentials', {
    form: {
      csrfToken,
      email: 'e2e@test.local',
      name: 'E2E Test User',
    },
    maxRedirects: 0,
  });

  // The response should be a 302 redirect
  expect(callbackRes.status()).toBe(302);

  // Step 3: Navigate to dashboard — the session cookie should be set
  // from the POST response above
  await page.goto('/dashboard');
  await expect(page.locator('h1')).toContainText('链接管理', { timeout: 15_000 });

  // Save signed-in state
  await context.storageState({ path: authFile });
});
