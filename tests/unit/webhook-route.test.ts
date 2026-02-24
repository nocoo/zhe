import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB modules
const mockGetWebhookByToken = vi.fn();
const mockGetWebhookStats = vi.fn();
const mockGetLinkByUserAndUrl = vi.fn();
const mockGetFolderByUserAndName = vi.fn();
const mockSlugExists = vi.fn();
const mockCreateLink = vi.fn();

vi.mock("@/lib/db", () => ({
  getWebhookByToken: (...args: unknown[]) => mockGetWebhookByToken(...args),
  getWebhookStats: (...args: unknown[]) => mockGetWebhookStats(...args),
  getLinkByUserAndUrl: (...args: unknown[]) => mockGetLinkByUserAndUrl(...args),
  getFolderByUserAndName: (...args: unknown[]) => mockGetFolderByUserAndName(...args),
  slugExists: (...args: unknown[]) => mockSlugExists(...args),
  createLink: (...args: unknown[]) => mockCreateLink(...args),
}));

// Mock rate limiter
const mockCheckRateLimit = vi.fn();
vi.mock("@/models/webhook", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/webhook")>();
  return {
    ...original,
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  };
});

// Mock slug generation
const mockGenerateUniqueSlug = vi.fn();
const mockSanitizeSlug = vi.fn();
vi.mock("@/lib/slug", () => ({
  generateUniqueSlug: (...args: unknown[]) => mockGenerateUniqueSlug(...args),
  sanitizeSlug: (...args: unknown[]) => mockSanitizeSlug(...args),
}));

import { POST, GET, HEAD } from "@/app/api/webhook/[token]/route";

function makeRequest(
  token: string,
  body: unknown,
  method = "POST",
): Request {
  return new Request(`http://localhost/api/webhook/${token}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

describe("POST /api/webhook/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockGetLinkByUserAndUrl.mockResolvedValue(null);
    mockGetFolderByUserAndName.mockResolvedValue(null);
  });

  it("returns 404 for invalid token", async () => {
    mockGetWebhookByToken.mockResolvedValue(null);

    const res = await POST(
      makeRequest("bad-token", { url: "https://example.com" }),
      makeParams("bad-token"),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 429 when rate limited", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      createdAt: new Date(),
    });
    mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 30000 });

    const res = await POST(
      makeRequest("valid-token", { url: "https://example.com" }),
      makeParams("valid-token"),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("returns 400 for invalid payload (missing url)", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      createdAt: new Date(),
    });

    const res = await POST(
      makeRequest("valid-token", {}),
      makeParams("valid-token"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid url format", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      createdAt: new Date(),
    });

    const res = await POST(
      makeRequest("valid-token", { url: "not-a-url" }),
      makeParams("valid-token"),
    );
    expect(res.status).toBe(400);
  });

  it("creates a link with auto-generated slug and returns short URL", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      createdAt: new Date(),
    });
    mockGenerateUniqueSlug.mockResolvedValue("abc123");
    mockCreateLink.mockResolvedValue({
      id: 10,
      userId: "user-1",
      slug: "abc123",
      originalUrl: "https://example.com/long-page",
      isCustom: false,
      clicks: 0,
      createdAt: new Date(),
    });

    const res = await POST(
      makeRequest("valid-token", { url: "https://example.com/long-page" }),
      makeParams("valid-token"),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.slug).toBe("abc123");
    expect(json.shortUrl).toContain("abc123");
    expect(json.originalUrl).toBe("https://example.com/long-page");
  });

  it("creates a link with custom slug", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      createdAt: new Date(),
    });
    mockSanitizeSlug.mockReturnValue("my-custom");
    mockSlugExists.mockResolvedValue(false);
    mockCreateLink.mockResolvedValue({
      id: 11,
      userId: "user-1",
      slug: "my-custom",
      originalUrl: "https://example.com",
      isCustom: true,
      clicks: 0,
      createdAt: new Date(),
    });

    const res = await POST(
      makeRequest("valid-token", {
        url: "https://example.com",
        customSlug: "my-custom",
      }),
      makeParams("valid-token"),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.slug).toBe("my-custom");
  });

  it("returns 400 for invalid custom slug", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      createdAt: new Date(),
    });
    mockSanitizeSlug.mockReturnValue(null);

    const res = await POST(
      makeRequest("valid-token", {
        url: "https://example.com",
        customSlug: "has spaces",
      }),
      makeParams("valid-token"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 409 when custom slug already exists", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      createdAt: new Date(),
    });
    mockSanitizeSlug.mockReturnValue("taken");
    mockSlugExists.mockResolvedValue(true);

    const res = await POST(
      makeRequest("valid-token", {
        url: "https://example.com",
        customSlug: "taken",
      }),
      makeParams("valid-token"),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("slug");
  });

  it("returns 400 for non-JSON body", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/webhook/valid-token", {
      method: "POST",
      body: "not json",
    });

    const res = await POST(req, makeParams("valid-token"));
    expect(res.status).toBe(400);
  });

  describe("idempotency", () => {
    it("returns 200 with existing link when URL already exists for the user", async () => {
      mockGetWebhookByToken.mockResolvedValue({
        id: 1,
        userId: "user-1",
        token: "valid-token",
        createdAt: new Date(),
      });
      mockGetLinkByUserAndUrl.mockResolvedValue({
        id: 5,
        userId: "user-1",
        slug: "existing-slug",
        originalUrl: "https://example.com/already-exists",
        isCustom: false,
        clicks: 3,
        createdAt: new Date(),
      });

      const res = await POST(
        makeRequest("valid-token", { url: "https://example.com/already-exists" }),
        makeParams("valid-token"),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.slug).toBe("existing-slug");
      expect(json.shortUrl).toContain("existing-slug");
      expect(json.originalUrl).toBe("https://example.com/already-exists");
    });

    it("does not create a new link when URL already exists", async () => {
      mockGetWebhookByToken.mockResolvedValue({
        id: 1,
        userId: "user-1",
        token: "valid-token",
        createdAt: new Date(),
      });
      mockGetLinkByUserAndUrl.mockResolvedValue({
        id: 5,
        userId: "user-1",
        slug: "existing-slug",
        originalUrl: "https://example.com/dup",
        isCustom: false,
        clicks: 0,
        createdAt: new Date(),
      });

      await POST(
        makeRequest("valid-token", { url: "https://example.com/dup" }),
        makeParams("valid-token"),
      );

      expect(mockCreateLink).not.toHaveBeenCalled();
      expect(mockGenerateUniqueSlug).not.toHaveBeenCalled();
    });

    it("ignores customSlug when URL already exists and returns existing link", async () => {
      mockGetWebhookByToken.mockResolvedValue({
        id: 1,
        userId: "user-1",
        token: "valid-token",
        createdAt: new Date(),
      });
      mockGetLinkByUserAndUrl.mockResolvedValue({
        id: 5,
        userId: "user-1",
        slug: "original-slug",
        originalUrl: "https://example.com/exists",
        isCustom: false,
        clicks: 0,
        createdAt: new Date(),
      });

      const res = await POST(
        makeRequest("valid-token", {
          url: "https://example.com/exists",
          customSlug: "new-custom",
        }),
        makeParams("valid-token"),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.slug).toBe("original-slug");
      expect(mockCreateLink).not.toHaveBeenCalled();
      expect(mockSanitizeSlug).not.toHaveBeenCalled();
    });

    it("creates a new link when URL does not exist (existing 201 behavior)", async () => {
      mockGetWebhookByToken.mockResolvedValue({
        id: 1,
        userId: "user-1",
        token: "valid-token",
        createdAt: new Date(),
      });
      mockGetLinkByUserAndUrl.mockResolvedValue(null);
      mockGenerateUniqueSlug.mockResolvedValue("new-slug");
      mockCreateLink.mockResolvedValue({
        id: 20,
        userId: "user-1",
        slug: "new-slug",
        originalUrl: "https://example.com/brand-new",
        isCustom: false,
        clicks: 0,
        createdAt: new Date(),
      });

      const res = await POST(
        makeRequest("valid-token", { url: "https://example.com/brand-new" }),
        makeParams("valid-token"),
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.slug).toBe("new-slug");
      expect(mockCreateLink).toHaveBeenCalled();
    });
  });

  describe("folder resolution", () => {
    it("passes matching folderId when folder name matches", async () => {
      mockGetWebhookByToken.mockResolvedValue({
        id: 1,
        userId: "user-1",
        token: "valid-token",
        createdAt: new Date(),
      });
      mockGetFolderByUserAndName.mockResolvedValue({
        id: "folder-1",
        userId: "user-1",
        name: "工作",
        icon: "folder",
        createdAt: new Date(),
      });
      mockGenerateUniqueSlug.mockResolvedValue("abc");
      mockCreateLink.mockResolvedValue({
        id: 30,
        userId: "user-1",
        slug: "abc",
        originalUrl: "https://example.com",
        folderId: "folder-1",
        isCustom: false,
        clicks: 0,
        createdAt: new Date(),
      });

      const res = await POST(
        makeRequest("valid-token", {
          url: "https://example.com",
          folder: "工作",
        }),
        makeParams("valid-token"),
      );
      expect(res.status).toBe(201);
      expect(mockGetFolderByUserAndName).toHaveBeenCalledWith("user-1", "工作");
      expect(mockCreateLink).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: "folder-1" }),
      );
    });

    it("falls back to null folderId when folder name not found", async () => {
      mockGetWebhookByToken.mockResolvedValue({
        id: 1,
        userId: "user-1",
        token: "valid-token",
        createdAt: new Date(),
      });
      mockGetFolderByUserAndName.mockResolvedValue(null);
      mockGenerateUniqueSlug.mockResolvedValue("xyz");
      mockCreateLink.mockResolvedValue({
        id: 31,
        userId: "user-1",
        slug: "xyz",
        originalUrl: "https://example.com/no-folder",
        folderId: null,
        isCustom: false,
        clicks: 0,
        createdAt: new Date(),
      });

      const res = await POST(
        makeRequest("valid-token", {
          url: "https://example.com/no-folder",
          folder: "不存在",
        }),
        makeParams("valid-token"),
      );
      expect(res.status).toBe(201);
      expect(mockGetFolderByUserAndName).toHaveBeenCalledWith("user-1", "不存在");
      expect(mockCreateLink).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: null }),
      );
    });

    it("does not call getFolderByUserAndName when folder is not provided", async () => {
      mockGetWebhookByToken.mockResolvedValue({
        id: 1,
        userId: "user-1",
        token: "valid-token",
        createdAt: new Date(),
      });
      mockGenerateUniqueSlug.mockResolvedValue("nofolder");
      mockCreateLink.mockResolvedValue({
        id: 32,
        userId: "user-1",
        slug: "nofolder",
        originalUrl: "https://example.com",
        folderId: null,
        isCustom: false,
        clicks: 0,
        createdAt: new Date(),
      });

      await POST(
        makeRequest("valid-token", { url: "https://example.com" }),
        makeParams("valid-token"),
      );
      expect(mockGetFolderByUserAndName).not.toHaveBeenCalled();
      expect(mockCreateLink).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: null }),
      );
    });

    it("ignores folder when idempotency hits (existing URL)", async () => {
      mockGetWebhookByToken.mockResolvedValue({
        id: 1,
        userId: "user-1",
        token: "valid-token",
        createdAt: new Date(),
      });
      mockGetLinkByUserAndUrl.mockResolvedValue({
        id: 5,
        userId: "user-1",
        slug: "existing",
        originalUrl: "https://example.com/dup",
        folderId: null,
        isCustom: false,
        clicks: 0,
        createdAt: new Date(),
      });

      const res = await POST(
        makeRequest("valid-token", {
          url: "https://example.com/dup",
          folder: "工作",
        }),
        makeParams("valid-token"),
      );
      expect(res.status).toBe(200);
      expect(mockGetFolderByUserAndName).not.toHaveBeenCalled();
      expect(mockCreateLink).not.toHaveBeenCalled();
    });
  });
});

describe("GET /api/webhook/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWebhookStats.mockResolvedValue({
      totalLinks: 0,
      totalClicks: 0,
      recentLinks: [],
    });
  });

  it("returns 404 for invalid token", async () => {
    mockGetWebhookByToken.mockResolvedValue(null);

    const req = new Request("http://localhost/api/webhook/bad-token", {
      method: "GET",
    });
    const res = await GET(req, makeParams("bad-token"));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns status, stats, and docs for valid token", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      rateLimit: 5,
      createdAt: new Date("2026-01-15T00:00:00.000Z"),
    });
    mockGetWebhookStats.mockResolvedValue({
      totalLinks: 42,
      totalClicks: 1337,
      recentLinks: [
        { slug: "abc", originalUrl: "https://example.com", clicks: 10, createdAt: "2026-02-20T00:00:00.000Z" },
      ],
    });

    const req = new Request("http://localhost/api/webhook/valid-token", {
      method: "GET",
    });
    const res = await GET(req, makeParams("valid-token"));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Status info
    expect(json.status).toBe("active");
    expect(json.createdAt).toBe("2026-01-15T00:00:00.000Z");
    expect(json.rateLimit).toBe(5);

    // Stats
    expect(json.stats.totalLinks).toBe(42);
    expect(json.stats.totalClicks).toBe(1337);
    expect(json.stats.recentLinks).toHaveLength(1);
    expect(json.stats.recentLinks[0].slug).toBe("abc");

    // Docs
    expect(json.docs).toBeDefined();
    expect(json.docs.endpoint).toContain("valid-token");
    expect(json.docs.methods).toHaveLength(3);
  });

  it("builds endpoint URL from request origin", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "my-token",
      rateLimit: 5,
      createdAt: new Date(),
    });

    const req = new Request("https://zhe.example.com/api/webhook/my-token", {
      method: "GET",
    });
    const res = await GET(req, makeParams("my-token"));
    const json = await res.json();
    expect(json.docs.endpoint).toBe("https://zhe.example.com/api/webhook/my-token");
  });

  it("calls getWebhookStats with the webhook user id", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-42",
      token: "valid-token",
      rateLimit: 5,
      createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/webhook/valid-token", {
      method: "GET",
    });
    await GET(req, makeParams("valid-token"));
    expect(mockGetWebhookStats).toHaveBeenCalledWith("user-42");
  });

  it("returns empty stats when user has no links", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      rateLimit: 5,
      createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/webhook/valid-token", {
      method: "GET",
    });
    const res = await GET(req, makeParams("valid-token"));
    const json = await res.json();
    expect(json.stats.totalLinks).toBe(0);
    expect(json.stats.totalClicks).toBe(0);
    expect(json.stats.recentLinks).toHaveLength(0);
  });
});

describe("HEAD /api/webhook/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 for valid token", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      rateLimit: 5,
      createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/webhook/valid-token", {
      method: "HEAD",
    });
    const res = await HEAD(req, makeParams("valid-token"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("returns 404 for invalid token", async () => {
    mockGetWebhookByToken.mockResolvedValue(null);

    const req = new Request("http://localhost/api/webhook/bad-token", {
      method: "HEAD",
    });
    const res = await HEAD(req, makeParams("bad-token"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("does not return a JSON body", async () => {
    mockGetWebhookByToken.mockResolvedValue({
      id: 1,
      userId: "user-1",
      token: "valid-token",
      rateLimit: 5,
      createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/webhook/valid-token", {
      method: "HEAD",
    });
    const res = await HEAD(req, makeParams("valid-token"));
    const body = await res.text();
    expect(body).toBe("");
  });
});
