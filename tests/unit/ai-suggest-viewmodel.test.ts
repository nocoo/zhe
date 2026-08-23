// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateLink = vi.fn();
const mockEnsureTagOnLink = vi.fn();
vi.mock("@/actions/links", () => ({
  updateLink: (...args: unknown[]) => mockUpdateLink(...args),
}));
vi.mock("@/actions/tags", () => ({
  ensureTagOnLink: (...args: unknown[]) => mockEnsureTagOnLink(...args),
}));
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import {
  failedSuggestStep,
  loadHasAiKey,
  suggestStepState,
  useSuggestLinkOrgViewModel,
} from "@/viewmodels/useSuggestLinkOrgViewModel";

const callbacks = {
  onLinkUpdated: vi.fn(),
  onTagCreated: vi.fn(),
  onLinkTagAdded: vi.fn(),
  onLinkTagRemoved: vi.fn(),
};

const suggestion = {
  folders: [{ folderId: "f1", name: "工作", reason: "工作相关" }],
  tags: [
    { tagId: "t1", name: "文档", reason: "已有标签" },
    { tagId: null, name: "新标签", reason: "新建" },
  ],
  prompt: "url: https://example.com",
  rawText: '{"folders":[],"tags":[]}',
  model: "claude-sonnet-4-5",
  provider: "anthropic",
  durationMs: 1600,
};

describe("useSuggestLinkOrgViewModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens, stores options, and applies folder plus tags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => suggestion,
      }),
    );
    mockUpdateLink.mockResolvedValue({
      success: true,
      data: { id: 1, folderId: "f1" },
    });
    mockEnsureTagOnLink
      .mockResolvedValueOnce({
        success: true,
        data: { tag: { id: "t1", name: "文档" }, created: false, attached: true },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { tag: { id: "t2", name: "新标签" }, created: true, attached: true },
      });

    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(1);
    });
    expect(result.current.folders).toHaveLength(1);
    expect(result.current.tags[0]?.checked).toBe(true);
    expect(result.current.prompt).toContain("example.com");
    expect(result.current.rawText).toContain("folders");
    expect(result.current.failedStep).toBeNull();

    await act(async () => {
      await result.current.apply();
    });
    expect(mockUpdateLink).toHaveBeenCalledWith(1, { folderId: "f1" });
    expect(mockEnsureTagOnLink).toHaveBeenCalled();
    expect(callbacks.onLinkUpdated).toHaveBeenCalled();
    expect(callbacks.onTagCreated).toHaveBeenCalledWith({ id: "t1", name: "文档" });
    expect(callbacks.onTagCreated).toHaveBeenCalledWith({ id: "t2", name: "新标签" });
    expect(callbacks.onLinkTagAdded).toHaveBeenCalledTimes(2);
    expect(mockToastSuccess).toHaveBeenCalledWith("已应用建议");
  });

  it("keeps the dialog open when some tags fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => suggestion,
      }),
    );
    mockUpdateLink.mockResolvedValue({
      success: true,
      data: { id: 1, folderId: "f1" },
    });
    mockEnsureTagOnLink
      .mockResolvedValueOnce({
        success: true,
        data: { tag: { id: "t1", name: "文档" }, created: false, attached: true },
      })
      .mockResolvedValueOnce({ success: false, error: "Invalid tag name" });

    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(1);
    });
    await act(async () => {
      await result.current.apply();
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("Invalid tag name");
    expect(result.current.open).toBe(true);
    expect(result.current.tags).toHaveLength(1);
    expect(result.current.tags[0]?.draftName).toBe("新标签");
  });

  it("syncs a tag created on a previous failed attach retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => suggestion,
      }),
    );
    mockUpdateLink.mockResolvedValue({
      success: true,
      data: { id: 1, folderId: "f1" },
    });
    mockEnsureTagOnLink
      .mockResolvedValueOnce({ success: false, error: "Failed to add tag to link" })
      .mockResolvedValueOnce({ success: false, error: "Failed to add tag to link" })
      .mockResolvedValueOnce({
        success: true,
        data: { tag: { id: "t1", name: "文档" }, created: false, attached: true },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { tag: { id: "t2", name: "新标签" }, created: false, attached: true },
      });

    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(1);
    });
    await act(async () => {
      await result.current.apply();
    });
    expect(result.current.open).toBe(true);
    await act(async () => {
      await result.current.apply();
    });
    expect(callbacks.onTagCreated).toHaveBeenCalledWith({ id: "t2", name: "新标签" });
    expect(mockToastSuccess).toHaveBeenCalledWith("已应用建议");
  });

  it("is a no-op apply when nothing is selected after unchecking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => suggestion,
      }),
    );
    mockUpdateLink.mockResolvedValue({
      success: true,
      data: { id: 1, folderId: "f1" },
    });
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(1);
    });
    act(() => {
      result.current.toggleTag(0);
      result.current.toggleTag(1);
    });
    await act(async () => {
      await result.current.apply();
    });
    expect(mockEnsureTagOnLink).not.toHaveBeenCalled();
  });

  it("records an error when suggest fails and can close", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "尚未配置 AI",
          reason: "no_ai_config",
          prompt: "url: https://example.com",
        }),
      }),
    );
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(7);
    });
    expect(result.current.error).toContain("尚未配置 AI");
    expect(result.current.failedStep).toBe("prepare");
    expect(result.current.prompt).toContain("example.com");
    act(() => {
      result.current.renameTag(0, "ignored");
      result.current.close();
    });
    expect(result.current.open).toBe(false);
  });

  it("toasts when folder apply fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => suggestion,
      }),
    );
    mockUpdateLink.mockResolvedValue({ success: false, error: "Folder not found" });
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(1);
    });
    await act(async () => {
      await result.current.apply();
    });
    expect(mockToastError).toHaveBeenCalledWith("Folder not found");
    expect(result.current.open).toBe(true);
  });

  it("records a network error when suggest fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(1);
    });
    expect(result.current.error).toBe("网络错误");
    expect(result.current.failedStep).toBe("request");
  });

  it("maps parse_error onto the parse step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "模型返回不是有效 JSON",
          reason: "parse_error",
          prompt: "sent",
          rawText: "{",
        }),
      }),
    );
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(1);
    });
    expect(result.current.failedStep).toBe("parse");
    expect(result.current.rawText).toBe("{");
  });

  it("derives step states for loading, success, and failure", () => {
    expect(failedSuggestStep("parse_error")).toBe("parse");
    expect(failedSuggestStep("timeout")).toBe("request");
    expect(suggestStepState("request", true, "", null)).toBe("current");
    expect(suggestStepState("prepare", true, "", null)).toBe("done");
    expect(suggestStepState("parse", true, "", null)).toBe("pending");
    expect(suggestStepState("ready", false, "", null)).toBe("done");
    expect(suggestStepState("parse", false, "坏了", "parse")).toBe("error");
    expect(suggestStepState("request", false, "坏了", "parse")).toBe("done");
    expect(suggestStepState("ready", false, "坏了", "parse")).toBe("pending");
  });

  it("loads hasApiKey without caching a failed fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    expect(await loadHasAiKey()).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hasApiKey: true }),
      }),
    );
    expect(await loadHasAiKey()).toBe(true);
  });
});
