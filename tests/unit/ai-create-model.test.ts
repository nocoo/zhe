// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateAiModel = vi.fn();
const mockResolveAiConfig = vi.fn();
const mockCreateOpenAI = vi.fn();
const mockCreateAnthropic = vi.fn();
const mockAssertSafe = vi.fn();

vi.mock("@nocoo/next-ai/server", () => ({
  createAiModel: (...args: unknown[]) => mockCreateAiModel(...args),
  resolveAiConfig: (...args: unknown[]) => mockResolveAiConfig(...args),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (...args: unknown[]) => mockCreateOpenAI(...args),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: (...args: unknown[]) => mockCreateAnthropic(...args),
}));

vi.mock("@/models/ai-base-url", () => ({
  assertSafeAiBaseUrl: (...args: unknown[]) => mockAssertSafe(...args),
}));

import { createUserAiModel } from "@/lib/ai/create-model";

describe("createUserAiModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAiConfig.mockReturnValue({ provider: "anthropic" });
    mockCreateAiModel.mockReturnValue("builtin-model");
    mockAssertSafe.mockResolvedValue(undefined);
  });

  it("throws when required fields are missing", async () => {
    await expect(
      createUserAiModel({
        provider: null,
        apiKey: null,
        model: null,
        baseURL: null,
        sdkType: null,
        authType: null,
      }),
    ).rejects.toThrow("请先配置");
  });

  it("throws when custom fields are incomplete", async () => {
    await expect(
      createUserAiModel({
        provider: "custom",
        apiKey: "sk-test-key-1234",
        model: "gpt-4o",
        baseURL: null,
        sdkType: null,
        authType: null,
      }),
    ).rejects.toThrow("自定义供应商");
  });

  it("uses next-ai for builtin providers", async () => {
    const model = await createUserAiModel({
      provider: "anthropic",
      apiKey: "sk-test-key-1234",
      model: "claude-sonnet-4-5",
      baseURL: null,
      sdkType: null,
      authType: null,
    });
    expect(model).toBe("builtin-model");
    expect(mockCreateOpenAI).not.toHaveBeenCalled();
  });

  it("forwards optional builtin fields", async () => {
    await createUserAiModel({
      provider: "anthropic",
      apiKey: "sk-test-key-1234",
      model: "claude-sonnet-4-5",
      baseURL: "https://api.anthropic.com/v1",
      sdkType: "anthropic",
      authType: "apiKey",
    });
    expect(mockResolveAiConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api.anthropic.com/v1",
        sdkType: "anthropic",
        authType: "apiKey",
      }),
    );
  });

  it("builds a custom Anthropic bearer model without apiKey", async () => {
    const factory = vi.fn().mockReturnValue("custom-anthropic");
    mockCreateAnthropic.mockReturnValue(factory);
    const model = await createUserAiModel({
      provider: "custom",
      apiKey: "tok-test-aaaa",
      model: "claude-sonnet-4-5",
      baseURL: "https://gateway.example.com/v1",
      sdkType: "anthropic",
      authType: "bearer",
    });
    expect(model).toBe("custom-anthropic");
    expect(mockAssertSafe).toHaveBeenCalledWith("https://gateway.example.com/v1");
    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: "tok-test-aaaa",
        baseURL: "https://gateway.example.com/v1",
      }),
    );
    const arg = mockCreateAnthropic.mock.calls[0]?.[0] as { apiKey?: string; fetch: typeof fetch };
    expect(arg.apiKey).toBeUndefined();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    const init = { redirect: "follow" } as RequestInit;
    await arg.fetch("https://gateway.example.com/v1", init);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gateway.example.com/v1",
      expect.objectContaining({ redirect: "error" }),
    );
    fetchSpy.mockRestore();
  });

  it("builds a custom Anthropic apiKey model", async () => {
    const factory = vi.fn().mockReturnValue("custom-anthropic-key");
    mockCreateAnthropic.mockReturnValue(factory);
    await createUserAiModel({
      provider: "custom",
      apiKey: "sk-test-key-1234",
      model: "claude-sonnet-4-5",
      baseURL: "https://gateway.example.com/v1",
      sdkType: "anthropic",
      authType: "apiKey",
    });
    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-test-key-1234" }),
    );
  });

  it("builds a custom OpenAI bearer model", async () => {
    const factory = vi.fn().mockReturnValue("custom-openai-bearer");
    mockCreateOpenAI.mockReturnValue(factory);
    await createUserAiModel({
      provider: "custom",
      apiKey: "tok-test-bbbb",
      model: "gpt-4o",
      baseURL: "https://gateway.example.com/v1",
      sdkType: "openai",
      authType: "bearer",
    });
    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer tok-test-bbbb" },
      }),
    );
  });

  it("uses redirect:error on the custom fetch", async () => {
    const factory = vi.fn().mockReturnValue("custom-openai");
    mockCreateOpenAI.mockReturnValue(factory);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    await createUserAiModel({
      provider: "custom",
      apiKey: "sk-test-key-1234",
      model: "gpt-4o",
      baseURL: "https://gateway.example.com/v1",
      sdkType: "openai",
      authType: "apiKey",
    });
    const arg = mockCreateOpenAI.mock.calls[0]?.[0] as { fetch: typeof fetch };
    await arg.fetch("https://gateway.example.com/v1", { method: "POST" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gateway.example.com/v1",
      expect.objectContaining({ redirect: "error" }),
    );
    fetchSpy.mockRestore();
  });
});
