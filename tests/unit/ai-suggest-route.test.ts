// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockRunAiTask = vi.fn();
const mockRefreshLinkEnrichment = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

vi.mock("@/lib/ai/run-task", () => ({
  runAiTask: (...args: unknown[]) => mockRunAiTask(...args),
}));

vi.mock("@/lib/enrichment", () => ({
  refreshLinkEnrichment: (...args: unknown[]) => mockRefreshLinkEnrichment(...args),
}));

import { POST } from "@/app/api/ai/suggest-link-org/route";

const bareLink = {
  id: 1,
  originalUrl: "https://example.com",
  metaTitle: null as string | null,
  metaDescription: null as string | null,
  metaFavicon: null as string | null,
  note: "",
  folderId: null as string | null,
};

function db(overrides: Record<string, unknown> = {}) {
  return {
    getLinkById: vi.fn().mockResolvedValue({
      ...bareLink,
      metaTitle: "Example",
      metaDescription: "desc",
    }),
    getFolders: vi.fn().mockResolvedValue([{ id: "f1", name: "工作" }]),
    getTags: vi.fn().mockResolvedValue([{ id: "t1", name: "文档" }]),
    getLinkTags: vi.fn().mockResolvedValue([]),
    getAiSettings: vi.fn().mockResolvedValue({
      provider: "anthropic",
      apiKey: "sk-test-key-1234",
      model: "claude-sonnet-4-5",
    }),
    ...overrides,
  };
}

function auth(overrides: Record<string, unknown> = {}) {
  const scoped = db(overrides);
  mockGetAuthContext.mockResolvedValue({ db: scoped, userId: "user-1" });
  return scoped;
}

describe("POST /api/ai/suggest-link-org", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshLinkEnrichment.mockResolvedValue({ success: true });
  });

  it("returns 400 without config", async () => {
    auth();
    mockRunAiTask.mockResolvedValue({ ok: false, reason: "no_ai_config", message: "missing" });
    const res = await POST(
      new Request("http://localhost/api/ai/suggest-link-org", {
        method: "POST",
        body: JSON.stringify({ linkId: 1 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "no_ai_config" });
  });

  it("returns 404 for an unknown link", async () => {
    auth({ getLinkById: vi.fn().mockResolvedValue(null) });
    const res = await POST(
      new Request("http://localhost/api/ai/suggest-link-org", {
        method: "POST",
        body: JSON.stringify({ linkId: 99 }),
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: "not_found" });
  });

  it("maps parse_error to 502 and timeout to 504", async () => {
    auth();
    mockRunAiTask.mockResolvedValueOnce({ ok: false, reason: "parse_error", message: "bad" });
    const parseRes = await POST(
      new Request("http://localhost/api/ai/suggest-link-org", {
        method: "POST",
        body: JSON.stringify({ linkId: 1 }),
      }),
    );
    expect(parseRes.status).toBe(502);

    mockRunAiTask.mockResolvedValueOnce({ ok: false, reason: "timeout", message: "slow" });
    const timeoutRes = await POST(
      new Request("http://localhost/api/ai/suggest-link-org", {
        method: "POST",
        body: JSON.stringify({ linkId: 1 }),
      }),
    );
    expect(timeoutRes.status).toBe(504);
    expect(await parseRes.json()).toMatchObject({
      reason: "parse_error",
      prompt: expect.stringContaining("https://example.com"),
    });
  });

  it("returns prompt and raw text with suggestions", async () => {
    auth();
    mockRunAiTask.mockResolvedValue({
      ok: true,
      result: {
        folders: [{ folderId: "f1", name: "工作", reason: "适合" }],
        tags: [{ tagId: "t1", name: "文档", reason: "文档" }],
        note: "示例站点",
      },
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      durationMs: 12,
      rawText: '{"folders":[],"tags":[]}',
    });
    const res = await POST(
      new Request("http://localhost/api/ai/suggest-link-org", {
        method: "POST",
        body: JSON.stringify({ linkId: 1 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRefreshLinkEnrichment).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      prompt: expect.stringContaining("https://example.com"),
      rawText: '{"folders":[],"tags":[]}',
      model: "claude-sonnet-4-5",
      note: "示例站点",
      catalogs: {
        folders: [{ id: "f1", name: "工作" }],
        tags: [{ id: "t1", name: "文档" }],
      },
    });
  });

  it("refreshes metadata before building the prompt when the link has none", async () => {
    const getLinkById = vi
      .fn()
      .mockResolvedValueOnce(bareLink)
      .mockResolvedValueOnce({
        ...bareLink,
        metaTitle: "Whoiz",
        metaDescription: "GitHub 上的开源项目",
      });
    auth({ getLinkById });
    mockRunAiTask.mockResolvedValue({
      ok: true,
      result: {
        folders: [{ folderId: "f1", name: "工作", reason: "适合" }],
        tags: [{ tagId: "t1", name: "文档", reason: "文档" }],
        note: "开源项目",
      },
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      durationMs: 12,
      rawText: "{}",
    });
    const res = await POST(
      new Request("http://localhost/api/ai/suggest-link-org", {
        method: "POST",
        body: JSON.stringify({ linkId: 1 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRefreshLinkEnrichment).toHaveBeenCalledWith("https://example.com", 1, "user-1");
    expect(mockRunAiTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.stringMatching(/Whoiz[\s\S]*GitHub 上的开源项目/),
      }),
    );
  });

  it("does not refresh metadata when AI is not configured", async () => {
    auth({
      getLinkById: vi.fn().mockResolvedValue(bareLink),
      getAiSettings: vi.fn().mockResolvedValue({ provider: null, apiKey: null }),
    });
    mockRunAiTask.mockResolvedValue({ ok: false, reason: "no_ai_config", message: "尚未配置 AI" });
    const res = await POST(
      new Request("http://localhost/api/ai/suggest-link-org", {
        method: "POST",
        body: JSON.stringify({ linkId: 1 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockRefreshLinkEnrichment).not.toHaveBeenCalled();
  });

  it("still suggests when metadata refresh throws", async () => {
    auth({ getLinkById: vi.fn().mockResolvedValue(bareLink) });
    mockRefreshLinkEnrichment.mockRejectedValue(new Error("timeout"));
    mockRunAiTask.mockResolvedValue({
      ok: true,
      result: {
        folders: [{ folderId: "f1", name: "工作", reason: "适合" }],
        tags: [{ tagId: "t1", name: "文档", reason: "文档" }],
        note: "示例",
      },
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      durationMs: 12,
      rawText: "{}",
    });
    const res = await POST(
      new Request("http://localhost/api/ai/suggest-link-org", {
        method: "POST",
        body: JSON.stringify({ linkId: 1 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRunAiTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prompt: expect.stringContaining("title: example.com") }),
    );
  });
});
