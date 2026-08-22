// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTag } from "../fixtures";

const mockCreateTag = vi.fn();
const mockUpdateTag = vi.fn();
const mockDeleteTag = vi.fn();

vi.mock("@/actions/tags", () => ({
  createTag: (...args: unknown[]) => mockCreateTag(...args),
  updateTag: (...args: unknown[]) => mockUpdateTag(...args),
  deleteTag: (...args: unknown[]) => mockDeleteTag(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const work = makeTag({ id: "t1", name: "work", color: "sky" });
const home = makeTag({ id: "t2", name: "home", color: "green" });

const mockState = {
  tags: [work, home],
  linkTags: [
    { linkId: 1, tagId: "t1" },
    { linkId: 2, tagId: "t1" },
  ],
  ideas: [
    { id: 1, tagIds: ["t1", "t2"] },
    { id: 2, tagIds: ["t2"] },
  ],
};

const mockActions = {
  handleTagCreated: vi.fn(),
  handleTagDeleted: vi.fn(),
  handleTagUpdated: vi.fn(),
  ensureIdeasLoaded: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardState: () => mockState,
  useDashboardActions: () => mockActions,
}));

import { useTagsViewModel } from "@/viewmodels/useTagsViewModel";

describe("useTagsViewModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.tags = [work, home];
    mockActions.ensureIdeasLoaded.mockResolvedValue(undefined);
  });

  it("sorts rows and counts link/idea usage", () => {
    const { result } = renderHook(() => useTagsViewModel());
    expect(result.current.rows.map((r) => r.name)).toEqual(["home", "work"]);
    expect(result.current.rows[1]).toMatchObject({
      id: "t1",
      linkCount: 2,
      ideaCount: 1,
    });
    expect(result.current.rows[0]).toMatchObject({
      id: "t2",
      linkCount: 0,
      ideaCount: 2,
    });
  });

  it("loads ideas on mount", () => {
    renderHook(() => useTagsViewModel());
    expect(mockActions.ensureIdeasLoaded).toHaveBeenCalledTimes(1);
  });

  it("creates a tag and syncs dashboard state", async () => {
    const created = makeTag({ id: "t3", name: "new", color: "red" });
    mockCreateTag.mockResolvedValue({ success: true, data: created });
    const { result } = renderHook(() => useTagsViewModel());

    await act(async () => {
      result.current.startCreate();
    });
    expect(result.current.creating).toBe(true);

    let ok: boolean | undefined;
    await act(async () => {
      ok = (await result.current.handleCreate("new", "red")).success;
    });
    expect(ok).toBe(true);
    expect(mockCreateTag).toHaveBeenCalledWith({ name: "new", color: "red" });
    expect(mockActions.handleTagCreated).toHaveBeenCalledWith(created);
    expect(mockToastSuccess).toHaveBeenCalledWith("已创建标签");
    expect(result.current.creating).toBe(false);
  });

  it("rejects a duplicate create without calling the action", async () => {
    const { result } = renderHook(() => useTagsViewModel());
    let ok: boolean | undefined;
    await act(async () => {
      ok = (await result.current.handleCreate("Work", "red")).success;
    });
    expect(ok).toBe(false);
    expect(mockCreateTag).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("标签名已存在");
  });

  it("rejects an empty name", async () => {
    const { result } = renderHook(() => useTagsViewModel());
    let ok: boolean | undefined;
    await act(async () => {
      ok = (await result.current.handleCreate("   ")).success;
    });
    expect(ok).toBe(false);
    expect(mockCreateTag).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("标签名无效");
  });

  it("renames a tag", async () => {
    const updated = { ...work, name: "office" };
    mockUpdateTag.mockResolvedValue({ success: true, data: updated });
    const { result } = renderHook(() => useTagsViewModel());

    let ok: boolean | undefined;
    await act(async () => {
      ok = (await result.current.handleRename("t1", "office")).success;
    });
    expect(ok).toBe(true);
    expect(mockUpdateTag).toHaveBeenCalledWith("t1", { name: "office" });
    expect(mockActions.handleTagUpdated).toHaveBeenCalledWith(updated);
  });

  it("recolors a tag without a success toast", async () => {
    const updated = { ...work, color: "red" };
    mockUpdateTag.mockResolvedValue({ success: true, data: updated });
    const { result } = renderHook(() => useTagsViewModel());

    await act(async () => {
      await result.current.handleRecolor("t1", "red");
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("t1", { color: "red" });
    expect(mockActions.handleTagUpdated).toHaveBeenCalledWith(updated);
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("deletes a tag", async () => {
    mockDeleteTag.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useTagsViewModel());

    await act(async () => {
      await result.current.handleDelete("t1");
    });
    expect(mockDeleteTag).toHaveBeenCalledWith("t1");
    expect(mockActions.handleTagDeleted).toHaveBeenCalledWith("t1");
    expect(mockToastSuccess).toHaveBeenCalledWith("已删除标签");
  });

  it("toasts when create fails", async () => {
    mockCreateTag.mockResolvedValue({ success: false, error: "Failed to create tag" });
    const { result } = renderHook(() => useTagsViewModel());

    await act(async () => {
      await result.current.handleCreate("fresh", "sky");
    });
    expect(mockToastError).toHaveBeenCalledWith("Failed to create tag");
  });
});
