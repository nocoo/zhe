/**
 * E2E Webhook API Tests
 *
 * Tests the full request → response cycle of the webhook API route handlers:
 * HEAD (connection test), GET (status/docs), POST (link creation).
 * Uses real NextRequest/NextResponse objects with the in-memory D1 mock.
 * Each test uses a unique token to avoid rate-limiter cross-test pollution.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { clearMockStorage } from "../setup";
import { getMockWebhooks, getMockFolders } from "../mocks/db-storage";
import type { Webhook, Folder } from "@/lib/db/schema";

const BASE = "http://localhost:7005";

// Unique token counter to avoid rate limiter collisions across tests
let tokenSeq = 0;

function uniqueToken(): string {
  return `tok-${++tokenSeq}-${Date.now()}`;
}

/** Seed a webhook directly into mock storage. */
function seedWebhook(
  userId = "webhook-e2e-user",
  rateLimit = 5,
): { userId: string; token: string } {
  const token = uniqueToken();
  const mockWebhooks = getMockWebhooks();
  mockWebhooks.set(userId, {
    id: mockWebhooks.size + 1,
    user_id: userId,
    token,
    rate_limit: rateLimit,
    created_at: Date.now(),
  } as unknown as Webhook);
  return { userId, token };
}

/** Seed a folder directly into mock storage. */
function seedFolder(userId: string, folderName: string): string {
  const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const mockFolders = getMockFolders();
  mockFolders.set(id, {
    id,
    user_id: userId,
    name: folderName,
    icon: "folder",
    created_at: Date.now(),
  } as unknown as Folder);
  return id;
}

/** Seed a link via the DB layer (createLink is exported). */
async function seedLink(
  userId: string,
  slug: string,
  originalUrl: string,
) {
  const { createLink } = await import("@/lib/db");
  return createLink({
    userId,
    folderId: null,
    originalUrl,
    slug,
    isCustom: true,
    clicks: 0,
    expiresAt: null,
  });
}

// ============================================================
// Scenario 1: HEAD — Connection Test
// As an external integrator, I want to verify my webhook token
// is valid before wiring up automations.
// ============================================================
describe("HEAD /api/webhook/[token]", () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it("returns 200 for a valid token", async () => {
    const { token } = seedWebhook();

    const { HEAD } = await import("@/app/api/webhook/[token]/route");
    const res = await HEAD(
      new Request(`${BASE}/api/webhook/${token}`, { method: "HEAD" }),
      { params: Promise.resolve({ token }) },
    );

    expect(res.status).toBe(200);
  });

  it("returns 404 for an invalid token", async () => {
    const { HEAD } = await import("@/app/api/webhook/[token]/route");
    const res = await HEAD(
      new Request(`${BASE}/api/webhook/nonexistent`, { method: "HEAD" }),
      { params: Promise.resolve({ token: "nonexistent" }) },
    );

    expect(res.status).toBe(404);
  });
});

// ============================================================
// Scenario 2: GET — Status & Documentation
// As an external integrator, I want to see my webhook's status,
// usage stats, and API docs so I know it's working.
// ============================================================
describe("GET /api/webhook/[token]", () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it("returns 404 for an invalid token", async () => {
    const { GET } = await import("@/app/api/webhook/[token]/route");
    const res = await GET(
      new NextRequest(`${BASE}/api/webhook/bad-token`),
      { params: Promise.resolve({ token: "bad-token" }) },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Invalid webhook token");
  });

  it("returns status, stats, and docs for a valid token", async () => {
    const { userId, token } = seedWebhook();
    // Seed some links so stats are non-zero
    await seedLink(userId, "wh-link1", "https://example.com/1");
    await seedLink(userId, "wh-link2", "https://example.com/2");

    const { GET } = await import("@/app/api/webhook/[token]/route");
    const res = await GET(
      new NextRequest(`${BASE}/api/webhook/${token}`),
      { params: Promise.resolve({ token }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("active");
    expect(body.createdAt).toBeDefined();
    expect(body.rateLimit).toBe(5);
    expect(body.stats.totalLinks).toBe(2);
    expect(body.stats.totalClicks).toBe(0);
    expect(body.docs).toBeDefined();
    expect(body.docs.openapi).toBe("3.1.0");
    expect(body.docs.servers[0].url).toContain(`/api/webhook/${token}`);
  });
});

// ============================================================
// Scenario 3: POST — Link Creation
// As an external integrator, I want to create short links via
// the webhook so I can automate link generation from my tools.
// ============================================================
describe("POST /api/webhook/[token]", () => {
  beforeEach(() => {
    clearMockStorage();
  });

  function buildPostRequest(token: string, body: unknown): [Request, { params: Promise<{ token: string }> }] {
    return [
      new NextRequest(`${BASE}/api/webhook/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ token }) },
    ];
  }

  // --- Auth ---

  it("returns 404 for an invalid token", async () => {
    const { POST } = await import("@/app/api/webhook/[token]/route");
    const res = await POST(
      ...buildPostRequest("fake-token", { url: "https://example.com" }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Invalid webhook token");
  });

  // --- Validation ---

  it("returns 400 for non-JSON body", async () => {
    const { token } = seedWebhook();
    const { POST } = await import("@/app/api/webhook/[token]/route");

    const res = await POST(
      new NextRequest(`${BASE}/api/webhook/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({ token }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when url is missing", async () => {
    const { token } = seedWebhook();
    const { POST } = await import("@/app/api/webhook/[token]/route");
    const res = await POST(...buildPostRequest(token, {}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("url");
  });

  it("returns 400 when url is invalid", async () => {
    const { token } = seedWebhook();
    const { POST } = await import("@/app/api/webhook/[token]/route");
    const res = await POST(
      ...buildPostRequest(token, { url: "not-a-url" }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("valid URL");
  });

  // --- Happy path: auto-generated slug ---

  it("creates a link with an auto-generated slug", async () => {
    const { token } = seedWebhook();
    const { POST } = await import("@/app/api/webhook/[token]/route");
    const res = await POST(
      ...buildPostRequest(token, { url: "https://github.com/example" }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBeDefined();
    expect(body.slug.length).toBeGreaterThan(0);
    expect(body.shortUrl).toContain(body.slug);
    expect(body.originalUrl).toBe("https://github.com/example");
  });

  // --- Happy path: custom slug ---

  it("creates a link with a custom slug", async () => {
    const { token } = seedWebhook();
    const { POST } = await import("@/app/api/webhook/[token]/route");
    const res = await POST(
      ...buildPostRequest(token, {
        url: "https://example.com/custom",
        customSlug: "my-custom",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("my-custom");
    expect(body.shortUrl).toContain("my-custom");
    expect(body.originalUrl).toBe("https://example.com/custom");

    // Verify link actually exists in DB
    const { getLinkBySlug } = await import("@/lib/db");
    const link = await getLinkBySlug("my-custom");
    expect(link).not.toBeNull();
    expect(link!.originalUrl).toBe("https://example.com/custom");
  });

  // --- Custom slug conflict ---

  it("returns 409 when custom slug is already taken", async () => {
    const { userId, token } = seedWebhook();
    await seedLink(userId, "taken-slug", "https://existing.com");

    const { POST } = await import("@/app/api/webhook/[token]/route");
    const res = await POST(
      ...buildPostRequest(token, {
        url: "https://example.com/new",
        customSlug: "taken-slug",
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already taken");
  });

  // --- Invalid custom slug ---

  it("returns 400 when custom slug is invalid", async () => {
    const { token } = seedWebhook();
    const { POST } = await import("@/app/api/webhook/[token]/route");
    const res = await POST(
      ...buildPostRequest(token, {
        url: "https://example.com",
        customSlug: "invalid slug with spaces!",
      }),
    );

    expect(res.status).toBe(400);
  });

  // --- Idempotency ---

  it("returns existing link (200) when same URL is posted again", async () => {
    const { token } = seedWebhook();
    const { POST } = await import("@/app/api/webhook/[token]/route");

    // First call — creates link
    const res1 = await POST(
      ...buildPostRequest(token, { url: "https://idempotent.example.com" }),
    );
    expect(res1.status).toBe(201);
    const body1 = await res1.json();

    // Second call — returns existing
    const res2 = await POST(
      ...buildPostRequest(token, { url: "https://idempotent.example.com" }),
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    expect(body2.slug).toBe(body1.slug);
    expect(body2.originalUrl).toBe(body1.originalUrl);
  });

  // --- Folder assignment ---

  it("assigns link to folder when folder name matches", async () => {
    const { userId, token } = seedWebhook();
    const folderId = seedFolder(userId, "Projects");

    const { POST } = await import("@/app/api/webhook/[token]/route");
    const res = await POST(
      ...buildPostRequest(token, {
        url: "https://example.com/project",
        folder: "Projects",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();

    // Verify the link's folderId matches
    const { getLinkBySlug } = await import("@/lib/db");
    const link = await getLinkBySlug(body.slug);
    expect(link).not.toBeNull();
    expect(link!.folderId).toBe(folderId);
  });

  it("creates link without folder when folder name does not match", async () => {
    const { token } = seedWebhook();

    const { POST } = await import("@/app/api/webhook/[token]/route");
    const res = await POST(
      ...buildPostRequest(token, {
        url: "https://example.com/nofolder",
        folder: "NonexistentFolder",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();

    const { getLinkBySlug } = await import("@/lib/db");
    const link = await getLinkBySlug(body.slug);
    expect(link).not.toBeNull();
    expect(link!.folderId).toBeNull();
  });

  // --- Rate limiting ---

  it("returns 429 when rate limit is exceeded", async () => {
    const { token } = seedWebhook("rate-limit-user", 2);
    const { POST } = await import("@/app/api/webhook/[token]/route");

    // First 2 should succeed (rate limit = 2)
    for (let i = 0; i < 2; i++) {
      const res = await POST(
        ...buildPostRequest(token, {
          url: `https://example.com/rate-${i}`,
        }),
      );
      expect(res.status).toBeLessThan(400);
    }

    // Third should be rate-limited
    const res = await POST(
      ...buildPostRequest(token, {
        url: "https://example.com/rate-blocked",
      }),
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Rate limit");
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  // --- Full integration: create then verify via GET ---

  it("link created via POST appears in GET stats", async () => {
    const { token } = seedWebhook();
    const { POST, GET } = await import("@/app/api/webhook/[token]/route");

    // Create a link
    const postRes = await POST(
      ...buildPostRequest(token, { url: "https://stats-test.example.com" }),
    );
    expect(postRes.status).toBe(201);

    // GET should now show 1 link in stats
    const getRes = await GET(
      new NextRequest(`${BASE}/api/webhook/${token}`),
      { params: Promise.resolve({ token }) },
    );
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.stats.totalLinks).toBe(1);
  });
});
