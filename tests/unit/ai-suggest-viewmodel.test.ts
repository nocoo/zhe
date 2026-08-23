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

import { useSuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";

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
        data: { tag: { id: "t1", name: "文档" }, attached: true },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { tag: { id: "t2", name: "新标签" }, attached: true },
      });

    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(1);
    });
    expect(result.current.folders).toHaveLength(1);
    expect(result.current.tags[0]?.checked).toBe(true);

    await act(async () => {
      await result.current.apply();
    });
    expect(mockUpdateLink).toHaveBeenCalledWith(1, { folderId: "f1" });
    expect(mockEnsureTagOnLink).toHaveBeenCalled();
    expect(callbacks.onLinkUpdated).toHaveBeenCalled();
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
        json: async () => ({ error: "AI is not configured", reason: "no_ai_config" }),
      }),
    );
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(async () => {
      await result.current.openForLink(7);
    });
    expect(result.current.error).toContain("AI is not configured");
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
});
