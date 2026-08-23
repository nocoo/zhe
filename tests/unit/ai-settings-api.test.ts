// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAiSettings = vi.fn();
const mockUpsertAiSettings = vi.fn();
const mockGetScopedDB = vi.fn();
const mockCreateUserAiModel = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  getScopedDB: (...args: unknown[]) => mockGetScopedDB(...args),
}));

vi.mock("@/lib/ai/create-model", () => ({
  createUserAiModel: (...args: unknown[]) => mockCreateUserAiModel(...args),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

import { GET, PUT } from "@/app/api/settings/ai/route";
import { POST as TEST } from "@/app/api/settings/ai/test/route";

const stored = {
  provider: "anthropic",
  apiKey: "sk-test-key-1234",
  model: "claude-sonnet-4-5",
  baseURL: null,
  sdkType: null,
  authType: null,
};

function authed() {
  mockGetScopedDB.mockResolvedValue({
    getAiSettings: mockGetAiSettings,
    upsertAiSettings: mockUpsertAiSettings,
  });
}

describe("GET /api/settings/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetScopedDB.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns hasApiKey and last4 without an apiKey field", async () => {
    authed();
    mockGetAiSettings.mockResolvedValue(stored);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.hasApiKey).toBe(true);
    expect(body.apiKeyLast4).toBe("1234");
    expect(body).not.toHaveProperty("apiKey");
  });
});

describe("PUT /api/settings/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authed();
    mockGetAiSettings.mockResolvedValue({
      provider: null,
      apiKey: null,
      model: null,
      baseURL: null,
      sdkType: null,
      authType: null,
    });
    mockUpsertAiSettings.mockImplementation(async (data: typeof stored) => ({
      aiProvider: data.provider,
      aiApiKey: data.apiKey,
      aiModel: data.model,
      aiBaseUrl: data.baseURL,
      aiSdkType: data.sdkType,
      aiAuthType: data.authType,
    }));
  });

  it("rejects an invalid provider", async () => {
    const res = await PUT(
      new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        body: JSON.stringify({ provider: "nope" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "validation" });
  });

  it("rejects a masked placeholder", async () => {
    mockGetAiSettings.mockResolvedValue(stored);
    const res = await PUT(
      new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        body: JSON.stringify({ apiKey: "********1234" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "refusing masked placeholder" });
  });

  it("omitting apiKey keeps the stored key", async () => {
    mockGetAiSettings.mockResolvedValue(stored);
    const res = await PUT(
      new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        body: JSON.stringify({ model: "claude-opus-4-6" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpsertAiSettings).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-test-key-1234", model: "claude-opus-4-6" }),
    );
  });

  it("null apiKey clears the stored key", async () => {
    mockGetAiSettings.mockResolvedValue(stored);
    await PUT(
      new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        body: JSON.stringify({ apiKey: null }),
      }),
    );
    expect(mockUpsertAiSettings).toHaveBeenCalledWith(expect.objectContaining({ apiKey: null }));
  });

  it("rejects a partial custom provider patch", async () => {
    const res = await PUT(
      new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        body: JSON.stringify({ provider: "custom" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "validation" });
  });

  it("rejects a non-object JSON body", async () => {
    const res = await PUT(
      new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        body: "null",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "validation" });
  });

  it("rejects a non-string model field", async () => {
    const res = await PUT(
      new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        body: JSON.stringify({ model: 12 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "validation" });
  });

  it("fills the builtin default model when omitted", async () => {
    const res = await PUT(
      new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        body: JSON.stringify({ provider: "anthropic" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpsertAiSettings).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic", model: expect.any(String) }),
    );
    const payload = mockUpsertAiSettings.mock.calls[0]?.[0] as { model: string };
    expect(payload.model.length).toBeGreaterThan(0);
  });
});

describe("POST /api/settings/ai/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authed();
  });

  it("returns 400 without a key", async () => {
    mockGetAiSettings.mockResolvedValue({
      provider: null,
      apiKey: null,
      model: null,
      baseURL: null,
      sdkType: null,
      authType: null,
    });
    const res = await TEST();
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "no_ai_config" });
  });

  it("returns success when generateText is mocked", async () => {
    mockGetAiSettings.mockResolvedValue(stored);
    mockCreateUserAiModel.mockResolvedValue({});
    mockGenerateText.mockResolvedValue({ text: "OK" });
    const res = await TEST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      response: "OK",
      provider: "anthropic",
    });
    expect(mockCreateUserAiModel).toHaveBeenCalledWith(stored);
  });

  it("maps an upstream 401", async () => {
    mockGetAiSettings.mockResolvedValue(stored);
    mockCreateUserAiModel.mockResolvedValue({});
    const err = Object.assign(new Error("denied"), {
      statusCode: 401,
      responseBody: JSON.stringify({ error: { message: "bad key" } }),
    });
    mockGenerateText.mockRejectedValue(err);
    const res = await TEST();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: "ai_error", error: "bad key" });
  });
});
