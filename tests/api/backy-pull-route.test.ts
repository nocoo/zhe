/**
 * In-process tests for /api/backy/pull route handler.
 *
 * Extracted from tests/integration/backy.test.ts to enforce layer separation:
 * route handler tests (importing @/app/api/...) must run at L2 (pre-push),
 * not L1 (pre-commit).
 *
 * Uses the in-memory D1 mock from setup.ts + vi.mock auth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearMockStorage } from '../setup';

// ---------------------------------------------------------------------------
// Mocks — auth (D1 uses the global mock from setup.ts)
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_A = 'user-backy-e2e-a';
const USER_B = 'user-backy-e2e-b';

function authenticatedAs(userId: string) {
  mockAuth.mockResolvedValue({
    user: { id: userId, name: 'E2E User', email: 'e2e@test.com' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Pull API route (/api/backy/pull)', () => {
  beforeEach(() => {
    clearMockStorage();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('HEAD returns 200 for valid key', async () => {
    authenticatedAs(USER_A);
    const { generateBackyPullWebhook } = await import('@/actions/backy');
    const genResult = await generateBackyPullWebhook();
    const key = genResult.data!.key;

    const { HEAD } = await import('@/app/api/backy/pull/route');
    const request = new Request('http://localhost/api/backy/pull', {
      method: 'HEAD',
      headers: { 'x-webhook-key': key },
    });

    const response = await HEAD(request);
    expect(response.status).toBe(200);
  });

  it('HEAD returns 401 for missing key', async () => {
    const { HEAD } = await import('@/app/api/backy/pull/route');
    const request = new Request('http://localhost/api/backy/pull', {
      method: 'HEAD',
    });

    const response = await HEAD(request);
    expect(response.status).toBe(401);
  });

  it('HEAD returns 401 for invalid key', async () => {
    const { HEAD } = await import('@/app/api/backy/pull/route');
    const request = new Request('http://localhost/api/backy/pull', {
      method: 'HEAD',
      headers: { 'x-webhook-key': 'bogus-key-that-does-not-exist' },
    });

    const response = await HEAD(request);
    expect(response.status).toBe(401);
  });

  it('POST returns 401 for missing key', async () => {
    const { POST } = await import('@/app/api/backy/pull/route');
    const request = new Request('http://localhost/api/backy/pull', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Missing');
  });

  it('POST returns 401 for invalid key', async () => {
    const { POST } = await import('@/app/api/backy/pull/route');
    const request = new Request('http://localhost/api/backy/pull', {
      method: 'POST',
      headers: { 'x-webhook-key': 'invalid-key' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Invalid');
  });

  it('POST returns 422 when push config is missing', async () => {
    authenticatedAs(USER_A);
    const { generateBackyPullWebhook } = await import('@/actions/backy');
    const genResult = await generateBackyPullWebhook();
    const key = genResult.data!.key;

    // Pull key exists but push config (webhookUrl + apiKey) is not set
    const { POST } = await import('@/app/api/backy/pull/route');
    const request = new Request('http://localhost/api/backy/pull', {
      method: 'POST',
      headers: { 'x-webhook-key': key },
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toContain('config');
  });

  it('POST pushes backup to Backy and returns 200 with stats', async () => {
    authenticatedAs(USER_A);
    const { saveBackyConfig, generateBackyPullWebhook } =
      await import('@/actions/backy');

    // Seed link data via server action
    const { createLink } = await import('@/actions/links');
    await createLink({
      originalUrl: 'https://example.com/pull-test',
      customSlug: 'backy-pull-e2e',
    });

    // Set up push config
    await saveBackyConfig({
      webhookUrl: 'https://backy.test/wh',
      apiKey: 'pull-push-key-12345678',
    });

    // Generate pull key
    const genResult = await generateBackyPullWebhook();
    const key = genResult.data!.key;

    // Mock external Backy calls (POST push + GET history)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            project_name: 'zhe',
            environment: 'dev',
            total_backups: 1,
            recent_backups: [],
          }),
          { status: 200 },
        ),
      );

    const { POST } = await import('@/app/api/backy/pull/route');
    const request = new Request('http://localhost/api/backy/pull', {
      method: 'POST',
      headers: { 'x-webhook-key': key },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.stats.links).toBe(1);
    expect(body.tag).toBeTruthy();
    expect(body.fileName).toContain('zhe-backup-');
  });

  // Multi-user: HEAD /api/backy/pull with keys from different users
  it('HEAD accepts valid keys from different users', async () => {
    authenticatedAs(USER_A);
    const { generateBackyPullWebhook } = await import('@/actions/backy');
    const genA = await generateBackyPullWebhook();

    authenticatedAs(USER_B);
    const genB = await generateBackyPullWebhook();

    // User A's key should not match User B's key
    expect(genA.data!.key).not.toBe(genB.data!.key);

    // Both keys should be verifiable via HEAD
    const { HEAD } = await import('@/app/api/backy/pull/route');

    const respA = await HEAD(
      new Request('http://localhost/api/backy/pull', {
        method: 'HEAD',
        headers: { 'x-webhook-key': genA.data!.key },
      }),
    );
    expect(respA.status).toBe(200);

    const respB = await HEAD(
      new Request('http://localhost/api/backy/pull', {
        method: 'HEAD',
        headers: { 'x-webhook-key': genB.data!.key },
      }),
    );
    expect(respB.status).toBe(200);
  });
});
