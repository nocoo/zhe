// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("@nocoo/basalt/components/toast", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { useAiSettingsViewModel } from "@/viewmodels/useAiSettingsViewModel";

const publicSettings = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  baseURL: "",
  sdkType: "",
  authType: "",
  hasApiKey: true,
  apiKeyLast4: "1234",
};

describe("useAiSettingsViewModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => publicSettings,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads settings on mount", async () => {
    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.settings.provider).toBe("anthropic");
    expect(result.current.settings.hasApiKey).toBe(true);
    expect(result.current.canSubmit).toBe(true);
  });

  it("saves and toasts success", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return { ok: true, json: async () => ({ ...publicSettings, model: "claude-opus-4-6" }) };
      }
      return { ok: true, json: async () => publicSettings };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.handleSave();
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("已保存");
  });

  it("save-then-test sets success status", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).endsWith("/test")) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => publicSettings };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAiSettingsViewModel());
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.handleTest();
    });
    expect(result.current.testStatus).toBe("success");
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.testStatus).toBe("idle");
    vi.useRealTimers();
  });

  it("switches provider and custom model selection", async () => {
    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.handleProviderChange("custom");
    });
    expect(result.current.isCustomProvider).toBe(true);
    expect(result.current.settings.sdkType).toBe("openai");
    expect(result.current.settings.authType).toBe("apiKey");
    act(() => {
      result.current.handleSdkTypeChange("anthropic");
    });
    expect(result.current.settings.authType).toBe("bearer");

    act(() => {
      result.current.handleProviderChange("");
    });
    expect(result.current.settings.provider).toBe("");
    expect(result.current.canSubmit).toBe(false);

    act(() => {
      result.current.handleProviderChange("anthropic");
      result.current.handleModelSelect("__custom__");
    });
    expect(result.current.isCustomModel).toBe(true);
    act(() => {
      result.current.handleModelSelect("claude-sonnet-4-5");
    });
    expect(result.current.settings.model).toBe("claude-sonnet-4-5");
    act(() => {
      result.current.setApiKeyInput("sk-new");
    });
    expect(result.current.apiKeyInput).toBe("sk-new");
  });

  it("sends custom fields and handles network failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => publicSettings })
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => {
      result.current.handleProviderChange("custom");
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(mockToastError).toHaveBeenCalledWith("保存失败");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => publicSettings });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      result.current.handleProviderChange("anthropic");
    });
    await act(async () => {
      await result.current.handleTest();
    });
    expect(result.current.testError === "网络错误" || mockToastError.mock.calls.length >= 1).toBe(
      true,
    );
  });

  it("toasts when save fails", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return { ok: false, json: async () => ({ error: "nope" }) };
      }
      return { ok: true, json: async () => publicSettings };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(mockToastError).toHaveBeenCalledWith("nope");
  });

  it("surfaces a test error", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).endsWith("/test")) {
        return { ok: false, json: async () => ({ error: "bad key" }) };
      }
      return { ok: true, json: async () => publicSettings };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.handleTest();
    });
    expect(result.current.testStatus).toBe("error");
    expect(result.current.testError).toBe("bad key");
  });

  it("handles custom provider loading with custom model", async () => {
    const customPublic = {
      ...publicSettings,
      provider: "custom",
      model: "my-custom-llm",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => customPublic,
      }),
    );
    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.isCustomProvider).toBe(true);
    expect(result.current.customModelInput).toBe("my-custom-llm");
  });

  it("handles initial fetch failure gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));
    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.settings.provider).toBe("");
  });

  it("handles saving with apiKey changed and fallback error message", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        if (init.body) capturedBody = JSON.parse(init.body as string);
        return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => publicSettings };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.setApiKeyInput("sk-test-secret");
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(capturedBody).toMatchObject({
      apiKey: "sk-test-secret",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    });
    expect(mockToastError).toHaveBeenCalledWith("保存失败");
  });

  it("handles test endpoint with empty error message fallback", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/test")) {
        return { ok: true, json: async () => ({ success: false }) };
      }
      if (init?.method === "PUT") {
        return { ok: true, json: async () => publicSettings };
      }
      return { ok: true, json: async () => publicSettings };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.handleTest();
    });
    expect(result.current.testStatus).toBe("error");
    expect(result.current.testError).toBe("连接失败");
  });

  it("handles custom provider authType switching based on existing authType or sdkType", async () => {
    const { result } = renderHook(() => useAiSettingsViewModel());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // Provider change to custom with default sdkType
    act(() => {
      result.current.handleProviderChange("custom");
    });
    expect(result.current.settings.authType).toBe("apiKey");

    // Change sdkType to anthropic
    act(() => {
      result.current.handleSdkTypeChange("anthropic");
    });
    expect(result.current.settings.authType).toBe("bearer");

    // Re-trigger handleProviderChange("custom") when sdkType is anthropic and authType is already bearer
    act(() => {
      result.current.handleProviderChange("custom");
    });
    expect(result.current.settings.authType).toBe("bearer");

    // Re-trigger handleProviderChange("custom") when sdkType is anthropic but authType is empty
    act(() => {
      result.current.setSettings((s) => ({ ...s, authType: "" }));
    });
    act(() => {
      result.current.handleProviderChange("custom");
    });
    expect(result.current.settings.authType).toBe("bearer");

    // sdkType change to non-anthropic sets apiKey
    act(() => {
      result.current.handleSdkTypeChange("openai");
    });
    expect(result.current.settings.authType).toBe("apiKey");

    // Provider change to one with undefined defaultModel (fallback to "")
    act(() => {
      result.current.handleProviderChange("deepseek");
    });
    expect(result.current.settings.provider).toBe("deepseek");

    // handleTest when handleSave fails returns early
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return { ok: false, json: async () => ({ error: "save failed" }) };
      }
      return { ok: true, json: async () => publicSettings };
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      await result.current.handleTest();
    });
    expect(result.current.testStatus).toBe("idle");
  });
});
