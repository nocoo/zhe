/**
 * E2E Backy Backup Integration Tests
 *
 * Tests the full Backy backup flow through server actions with the in-memory D1 mock.
 * Validates from the perspective of an authenticated user:
 *   - Push config lifecycle (save, get, round-trip, masked key)
 *   - Pull webhook lifecycle (generate, get, regenerate, revoke, verify)
 *   - testBackyConnection (stub global fetch)
 *   - fetchBackyHistory (stub global fetch)
 *   - pushBackup (stub global fetch, verify FormData payload)
 *   - Multi-user isolation (server actions only)
 *   - Unauthenticated access denied
 *
 * NOTE: Route handler tests for /api/backy/pull are in tests/api/backy-pull-route.test.ts
 * to enforce L2 layer separation (route handler tests run at pre-push, not pre-commit).
 *
 * BDD style — each scenario simulates a real user workflow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearMockStorage } from '../setup';
import type { Link } from '@/lib/db/schema';

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

function unauthenticated() {
  mockAuth.mockResolvedValue(null);
}

/** Create a link for the current authenticated user via server action */
async function seedLink(
  url: string,
  opts?: { customSlug?: string },
): Promise<Link> {
  const { createLink } = await import('@/actions/links');
  const result = await createLink({
    originalUrl: url,
    customSlug: opts?.customSlug,
  });
  if (!result.success || !result.data) {
    throw new Error(`Failed to seed link: ${result.error}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Backy backup integration (E2E)', () => {
  beforeEach(() => {
    clearMockStorage();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Auth guard — all 8 actions must reject unauthenticated users
  // =========================================================================
  describe('unauthenticated access', () => {
    it('rejects all backy actions when not authenticated', async () => {
      unauthenticated();

      const {
        getBackyConfig,
        saveBackyConfig,
        testBackyConnection,
        fetchBackyHistory,
        pushBackup,
        getBackyPullWebhook,
        generateBackyPullWebhook,
        revokeBackyPullWebhook,
      } = await import('@/actions/backy');

      const results = await Promise.all([
        getBackyConfig(),
        saveBackyConfig({ webhookUrl: 'https://backy.test/wh', apiKey: 'key123' }),
        testBackyConnection(),
        fetchBackyHistory(),
        pushBackup(),
        getBackyPullWebhook(),
        generateBackyPullWebhook(),
        revokeBackyPullWebhook(),
      ]);

      for (const result of results) {
        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
      }
    });
  });

  // =========================================================================
  // 2. Push config lifecycle
  // =========================================================================
  describe('push config lifecycle', () => {
    it('returns undefined data when no config saved yet', async () => {
      authenticatedAs(USER_A);
      const { getBackyConfig } = await import('@/actions/backy');

      const result = await getBackyConfig();
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('saves config and returns masked key on round-trip', async () => {
      authenticatedAs(USER_A);
      const { saveBackyConfig, getBackyConfig } = await import('@/actions/backy');

      // Save config
      const saveResult = await saveBackyConfig({
        webhookUrl: 'https://backy.test/webhook',
        apiKey: 'abcd1234efgh5678',
      });
      expect(saveResult.success).toBe(true);
      expect(saveResult.data?.webhookUrl).toBe('https://backy.test/webhook');
      expect(saveResult.data?.maskedApiKey).toBe('abcd••••••••5678');

      // Read it back
      const getResult = await getBackyConfig();
      expect(getResult.success).toBe(true);
      expect(getResult.data?.webhookUrl).toBe('https://backy.test/webhook');
      expect(getResult.data?.maskedApiKey).toBe('abcd••••••••5678');
    });

    it('upsert overwrites existing config', async () => {
      authenticatedAs(USER_A);
      const { saveBackyConfig, getBackyConfig } = await import('@/actions/backy');

      await saveBackyConfig({
        webhookUrl: 'https://backy.test/v1',
        apiKey: 'old-key-12345678',
      });

      await saveBackyConfig({
        webhookUrl: 'https://backy.test/v2',
        apiKey: 'new-key-87654321',
      });

      const result = await getBackyConfig();
      expect(result.data?.webhookUrl).toBe('https://backy.test/v2');
      expect(result.data?.maskedApiKey).toContain('new-');
    });

    it('rejects invalid webhook URL', async () => {
      authenticatedAs(USER_A);
      const { saveBackyConfig } = await import('@/actions/backy');

      const result = await saveBackyConfig({
        webhookUrl: 'not-a-url',
        apiKey: 'some-key-1234',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('URL');
    });

    it('rejects empty API key', async () => {
      authenticatedAs(USER_A);
      const { saveBackyConfig } = await import('@/actions/backy');

      const result = await saveBackyConfig({
        webhookUrl: 'https://backy.test/wh',
        apiKey: '  ',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('API Key');
    });
  });

  // =========================================================================
  // 3. Pull webhook lifecycle
  // =========================================================================
  describe('pull webhook lifecycle', () => {
    it('returns undefined data when no pull key generated yet', async () => {
      authenticatedAs(USER_A);
      const { getBackyPullWebhook } = await import('@/actions/backy');

      const result = await getBackyPullWebhook();
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('generates a pull key and reads it back', async () => {
      authenticatedAs(USER_A);
      const { generateBackyPullWebhook, getBackyPullWebhook } =
        await import('@/actions/backy');

      const genResult = await generateBackyPullWebhook();
      expect(genResult.success).toBe(true);
      expect(genResult.data?.key).toBeTruthy();
      const key = genResult.data!.key;

      // Read it back
      const getResult = await getBackyPullWebhook();
      expect(getResult.success).toBe(true);
      expect(getResult.data?.key).toBe(key);
    });

    it('regenerate overwrites existing key', async () => {
      authenticatedAs(USER_A);
      const { generateBackyPullWebhook } = await import('@/actions/backy');

      const first = await generateBackyPullWebhook();
      const second = await generateBackyPullWebhook();

      expect(first.data?.key).toBeTruthy();
      expect(second.data?.key).toBeTruthy();
      expect(first.data!.key).not.toBe(second.data!.key);
    });

    it('revoke clears the key', async () => {
      authenticatedAs(USER_A);
      const {
        generateBackyPullWebhook,
        revokeBackyPullWebhook,
        getBackyPullWebhook,
      } = await import('@/actions/backy');

      await generateBackyPullWebhook();
      const revokeResult = await revokeBackyPullWebhook();
      expect(revokeResult.success).toBe(true);

      const getResult = await getBackyPullWebhook();
      expect(getResult.success).toBe(true);
      expect(getResult.data).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. testBackyConnection
  // =========================================================================
  describe('testBackyConnection', () => {
    it('returns success when Backy responds 200', async () => {
      authenticatedAs(USER_A);
      const { saveBackyConfig, testBackyConnection } =
        await import('@/actions/backy');

      await saveBackyConfig({
        webhookUrl: 'https://backy.test/wh',
        apiKey: 'test-key-12345678',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 200 }),
      );

      const result = await testBackyConnection();
      expect(result.success).toBe(true);

      // Verify fetch was called with HEAD + Bearer token
      expect(fetchSpy).toHaveBeenCalledWith('https://backy.test/wh', {
        method: 'HEAD',
        headers: { Authorization: 'Bearer test-key-12345678' },
      });
    });

    it('returns error when no config saved', async () => {
      authenticatedAs(USER_A);
      const { testBackyConnection } = await import('@/actions/backy');

      const result = await testBackyConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('未配置');
    });

    it('returns error on HTTP failure', async () => {
      authenticatedAs(USER_A);
      const { saveBackyConfig, testBackyConnection } =
        await import('@/actions/backy');

      await saveBackyConfig({
        webhookUrl: 'https://backy.test/wh',
        apiKey: 'test-key-12345678',
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 403 }),
      );

      const result = await testBackyConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
    });
  });

  // =========================================================================
  // 5. fetchBackyHistory
  // =========================================================================
  describe('fetchBackyHistory', () => {
    it('fetches history from Backy endpoint', async () => {
      authenticatedAs(USER_A);
      const { saveBackyConfig, fetchBackyHistory } =
        await import('@/actions/backy');

      await saveBackyConfig({
        webhookUrl: 'https://backy.test/wh',
        apiKey: 'hist-key-12345678',
      });

      const historyPayload = {
        project_name: 'zhe',
        environment: 'dev',
        total_backups: 2,
        recent_backups: [
          {
            id: 'b1',
            tag: 'v1.0.0',
            environment: 'dev',
            file_size: 1024,
            is_single_json: 1,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(historyPayload), { status: 200 }),
      );

      const result = await fetchBackyHistory();
      expect(result.success).toBe(true);
      expect(result.data?.project_name).toBe('zhe');
      expect(result.data?.total_backups).toBe(2);
      expect(result.data?.recent_backups).toHaveLength(1);
    });

    it('returns error when no config saved', async () => {
      authenticatedAs(USER_A);
      const { fetchBackyHistory } = await import('@/actions/backy');

      const result = await fetchBackyHistory();
      expect(result.success).toBe(false);
      expect(result.error).toContain('未配置');
    });
  });

  // =========================================================================
  // 6. pushBackup
  // =========================================================================
  describe('pushBackup', () => {
    it('gathers data, pushes to Backy, and returns stats', async () => {
      authenticatedAs(USER_A);
      const { saveBackyConfig, pushBackup } = await import('@/actions/backy');

      // Seed some data
      await seedLink('https://example.com/1', { customSlug: 'backy-e2e-1' });
      await seedLink('https://example.com/2', { customSlug: 'backy-e2e-2' });

      await saveBackyConfig({
        webhookUrl: 'https://backy.test/wh',
        apiKey: 'push-key-12345678',
      });

      // Mock the POST to Backy (push) + GET (history inline)
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
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

      const result = await pushBackup();
      expect(result.success).toBe(true);
      expect(result.data?.ok).toBe(true);
      expect(result.data?.message).toContain('成功');
      expect(result.data?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.data?.request?.backupStats?.links).toBe(2);

      // Verify the POST call used FormData
      const postCall = fetchSpy.mock.calls[0]!;
      expect(postCall[0]).toBe('https://backy.test/wh');
      expect(postCall[1]?.method).toBe('POST');
      expect(postCall[1]?.headers).toEqual({
        Authorization: 'Bearer push-key-12345678',
      });
      // body is a FormData instance
      expect(postCall[1]?.body).toBeInstanceOf(FormData);
    });

    it('returns error when no config saved', async () => {
      authenticatedAs(USER_A);
      const { pushBackup } = await import('@/actions/backy');

      const result = await pushBackup();
      expect(result.success).toBe(false);
      expect(result.error).toContain('未配置');
    });

    it('returns error details on push HTTP failure', async () => {
      authenticatedAs(USER_A);
      const { saveBackyConfig, pushBackup } = await import('@/actions/backy');

      await saveBackyConfig({
        webhookUrl: 'https://backy.test/wh',
        apiKey: 'fail-key-12345678',
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'quota exceeded' }), { status: 429 }),
      );

      const result = await pushBackup();
      expect(result.success).toBe(false);
      expect(result.error).toContain('429');
      expect(result.data?.ok).toBe(false);
      expect(result.data?.response?.status).toBe(429);
    });
  });

  // =========================================================================
  // 7. Pull API route — moved to tests/api/backy-pull-route.test.ts
  //    (route handler tests run at L2, not L1)
  // =========================================================================

  // =========================================================================
  // 8. Multi-user isolation (server action only — route tests in tests/api/)
  // =========================================================================
  describe('multi-user isolation', () => {
    it('users cannot see each other push configs', async () => {
      const { saveBackyConfig, getBackyConfig } = await import('@/actions/backy');

      authenticatedAs(USER_A);
      await saveBackyConfig({
        webhookUrl: 'https://backy.test/a',
        apiKey: 'key-a-12345678ab',
      });

      authenticatedAs(USER_B);
      const result = await getBackyConfig();
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('users cannot see each other pull keys', async () => {
      const { generateBackyPullWebhook, getBackyPullWebhook } =
        await import('@/actions/backy');

      authenticatedAs(USER_A);
      await generateBackyPullWebhook();

      authenticatedAs(USER_B);
      const result = await getBackyPullWebhook();
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  // =========================================================================
  // 9. Config interaction — push config + pull key are independent
  // =========================================================================
  describe('config independence', () => {
    it('saving push config does not affect pull key', async () => {
      authenticatedAs(USER_A);
      const {
        generateBackyPullWebhook,
        saveBackyConfig,
        getBackyPullWebhook,
      } = await import('@/actions/backy');

      // Generate pull key first
      const genResult = await generateBackyPullWebhook();
      const key = genResult.data!.key;

      // Save push config
      await saveBackyConfig({
        webhookUrl: 'https://backy.test/wh',
        apiKey: 'config-key-12345678',
      });

      // Pull key should still be there
      const pullResult = await getBackyPullWebhook();
      expect(pullResult.data?.key).toBe(key);
    });

    it('revoking pull key does not affect push config', async () => {
      authenticatedAs(USER_A);
      const {
        saveBackyConfig,
        generateBackyPullWebhook,
        revokeBackyPullWebhook,
        getBackyConfig,
      } = await import('@/actions/backy');

      await saveBackyConfig({
        webhookUrl: 'https://backy.test/wh',
        apiKey: 'keep-key-12345678',
      });
      await generateBackyPullWebhook();
      await revokeBackyPullWebhook();

      // Push config should still be intact
      const configResult = await getBackyConfig();
      expect(configResult.data?.webhookUrl).toBe('https://backy.test/wh');
    });
  });
});
