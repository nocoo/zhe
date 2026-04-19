/**
 * L2 E2E tests for webhook token invalidation and rate limiting.
 *
 * Closes the audit gap: "/api/link/create/[token] never tested rate limit /
 * token invalidation / soft-delete scenarios". Note: this app does not use
 * soft-deletes — webhook revocation is a hard DELETE — so the "soft-delete"
 * leg of the gap collapses to "after delete, all verbs return 404".
 *
 * Covered here:
 *   1. After the webhook row is deleted, HEAD/GET/POST all return 404.
 *   2. Re-issuing a webhook for the same user replaces the token: the old
 *      token returns 404 even though a webhook exists for the user.
 *   3. POST exceeding the per-token rate limit returns 429 with Retry-After.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { apiGet, apiHead, apiPost } from './helpers/http';
import {
  seedTestUser,
  seedWebhook,
  cleanupTestData,
  executeD1,
  testSlug,
} from './helpers/seed';

const TEST_USER_ID = 'api-webhook-invalidation-test-user';

beforeAll(async () => {
  await cleanupTestData(TEST_USER_ID);
  await seedTestUser(TEST_USER_ID);
});

afterAll(async () => {
  await cleanupTestData(TEST_USER_ID);
});

describe('webhook token invalidation', () => {
  it('HEAD/GET/POST return 404 after the webhook row is deleted', async () => {
    const { token } = await seedWebhook({ userId: TEST_USER_ID });

    // Sanity: token works before delete
    expect((await apiHead(`/api/link/create/${token}`)).status).toBe(200);

    // Delete the webhook (hard delete — no soft-delete in this codebase)
    await executeD1('DELETE FROM webhooks WHERE user_id = ?', [TEST_USER_ID]);

    expect((await apiHead(`/api/link/create/${token}`)).status).toBe(404);
    expect((await apiGet(`/api/link/create/${token}`)).status).toBe(404);

    const post = await apiPost(`/api/link/create/${token}`, {
      url: 'https://example.com/after-revoke',
    });
    expect(post.status).toBe(404);
    const body = await post.json();
    expect(body.error).toBe('Invalid webhook token');
  });

  it('rotating the webhook invalidates the previous token', async () => {
    const { token: oldToken } = await seedWebhook({ userId: TEST_USER_ID });
    expect((await apiHead(`/api/link/create/${oldToken}`)).status).toBe(200);

    // seedWebhook deletes the existing row and inserts a fresh one — same
    // user, brand-new token. Old token must immediately stop working.
    const { token: newToken } = await seedWebhook({ userId: TEST_USER_ID });
    expect(newToken).not.toBe(oldToken);

    expect((await apiHead(`/api/link/create/${oldToken}`)).status).toBe(404);
    expect((await apiHead(`/api/link/create/${newToken}`)).status).toBe(200);
  });
});

describe('webhook rate limiting', () => {
  it('returns 429 with Retry-After once per-token limit is exhausted', async () => {
    // Tight limit so we can trip it cheaply
    const RL = 5;
    const { token } = await seedWebhook({ userId: TEST_USER_ID, rateLimit: RL });
    const TOTAL = RL + 3;

    // Concurrent burst — webhook limiter is in-process and atomic under Node
    const responses = await Promise.all(
      Array.from({ length: TOTAL }, (_, i) =>
        apiPost(`/api/link/create/${token}`, {
          url: `https://example.com/${testSlug(`wh-rl-${i}`)}`,
        }),
      ),
    );

    const created = responses.filter((r) => r.status === 201);
    const blocked = responses.filter((r) => r.status === 429);
    const others = responses.filter((r) => r.status !== 201 && r.status !== 429);

    if (others.length > 0) {
      throw new Error(`Unexpected statuses: ${others.map((r) => r.status).join(',')}`);
    }

    expect(created.length).toBe(RL);
    expect(blocked.length).toBe(TOTAL - RL);

    const first = blocked[0];
    if (!first) throw new Error('expected at least one 429 response');
    expect(first.headers.get('retry-after')).toMatch(/^\d+$/);
    const body = await first.json();
    expect(body.error).toBe('Rate limit exceeded');
  });
});
