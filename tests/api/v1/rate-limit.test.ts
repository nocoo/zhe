/**
 * L2 E2E test for actually triggering HTTP 429.
 *
 * The default v1 rate limit is 100 requests per 60s window per API key.
 * This spec spends a fresh API key (own keyId, no cross-spec interference)
 * to push past the threshold and assert the 429 response shape:
 *   - status 429
 *   - body { error: "Rate limit exceeded" }
 *   - X-RateLimit-Limit, X-RateLimit-Remaining=0, X-RateLimit-Reset, Retry-After headers
 *
 * Uses GET /api/v1/links (lightest endpoint) to keep the burst cheap.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedTestUser, seedApiKey, cleanupTestData, resetAndSeedUser } from "../helpers/seed";

const BASE = getBaseUrl();
const TEST_USER_ID = "api-v1-ratelimit-test-user";

describe("v1 rate limit (429)", () => {
  let apiKey: string;

  beforeAll(async () => {
    await resetAndSeedUser(TEST_USER_ID);
    apiKey = await seedApiKey(TEST_USER_ID, {
      name: "RL trigger",
      scopes: "links:read",
    });
  });

  afterAll(async () => {
    await cleanupTestData(TEST_USER_ID);
  });

  it(
    "returns 429 with proper headers after exceeding 100 requests in the window",
    async () => {
      const url = `${BASE}/api/v1/links?limit=1`;
      const total = 105; // 100 allowed + 5 over the line

      // Fire concurrently: the in-process sliding-window limiter is atomic
      // under Node's single thread (Map.set + Array.push are synchronous),
      // so 105 parallel requests deterministically split into 100 OK + 5 429.
      const responses = await Promise.all(
        Array.from({ length: total }, () => authenticatedFetch(url, apiKey)),
      );

      const okResponses = responses.filter((r) => r.status === 200);
      const blockedResponses = responses.filter((r) => r.status === 429);
      const others = responses.filter((r) => r.status !== 200 && r.status !== 429);

      if (others.length > 0) {
        throw new Error(`Unexpected statuses: ${others.map((r) => r.status).join(",")}`);
      }

      expect(okResponses.length).toBe(100);
      expect(blockedResponses.length).toBe(5);

      // First 429 must carry the right shape
      const blocked = blockedResponses[0];
      if (!blocked) throw new Error("expected at least one 429 response");
      expect(blocked.headers.get("x-ratelimit-limit")).toBe("100");
      expect(blocked.headers.get("x-ratelimit-remaining")).toBe("0");
      expect(blocked.headers.get("x-ratelimit-reset")).toMatch(/^\d+$/);
      expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);

      const body = await blocked.json();
      expect(body).toEqual({ error: "Rate limit exceeded" });
    },
    60_000,
  );
});
