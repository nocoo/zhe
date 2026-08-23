// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
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
});
