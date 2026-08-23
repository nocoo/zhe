// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetScopedDB = vi.fn();
const mockRunAiTask = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  getScopedDB: (...args: unknown[]) => mockGetScopedDB(...args),
}));

vi.mock("@/lib/ai/run-task", () => ({
  runAiTask: (...args: unknown[]) => mockRunAiTask(...args),
}));

import { POST } from "@/app/api/ai/suggest-link-org/route";

function db(overrides: Record<string, unknown> = {}) {
  return {
    getLinkById: vi.fn().mockResolvedValue({
      id: 1,
      originalUrl: "https://example.com",
      metaTitle: "Example",
      metaDescription: "desc",
      note: "",
      folderId: null,
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

describe("POST /api/ai/suggest-link-org", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 without config", async () => {
    mockGetScopedDB.mockResolvedValue(db());
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
    mockGetScopedDB.mockResolvedValue(db({ getLinkById: vi.fn().mockResolvedValue(null) }));
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
    mockGetScopedDB.mockResolvedValue(db());
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
    mockGetScopedDB.mockResolvedValue(db());
    mockRunAiTask.mockResolvedValue({
      ok: true,
      result: {
        folders: [{ folderId: "f1", name: "工作", reason: "适合" }],
        tags: [{ tagId: "t1", name: "文档", reason: "文档" }],
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
    expect(await res.json()).toMatchObject({
      prompt: expect.stringContaining("https://example.com"),
      rawText: '{"folders":[],"tags":[]}',
      model: "claude-sonnet-4-5",
    });
  });
});
