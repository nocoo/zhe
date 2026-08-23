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
    const init = { redirect: "follow" } as RequestInit;
    arg.fetch("https://gateway.example.com/v1", init);
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
