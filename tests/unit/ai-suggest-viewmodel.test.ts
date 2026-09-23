// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn();
const create = vi.fn();
vi.mock("@/actions/tags", () => ({ createTag: (...args: unknown[]) => create(...args) }));
vi.mock("@/actions/link-organization", () => ({
  applyLinkOrganization: (...args: unknown[]) => save(...args),
}));
vi.mock("@nocoo/basalt/components/toast", () => ({ toast: { success: vi.fn() } }));

import { failedSuggestStep } from "@/models/ai-suggest-progress";
import { useSuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";
import { makeLink } from "../fixtures";

const callbacks = {
  onLinkUpdated: vi.fn(),
  onTagCreated: vi.fn(),
  onLinkTagAdded: vi.fn(),
  onLinkTagRemoved: vi.fn(),
};
const context = {
  type: "context",
  revision: 3,
  supplied: ["URL"],
  notices: ["README 未收录"],
  current: { title: "旧标题", note: "旧备注", folderId: "old-folder", tagIds: ["old"] },
  catalogs: {
    folders: [{ id: "f", name: "开发" }],
    tags: [
      { id: "old", name: "已有标签" },
      { id: "recommended", name: "推荐标签" },
    ],
  },
  historicalAnalysis: null,
  prompt: "prompt",
  model: "model",
  provider: "custom",
};
const resultEvent = {
  type: "result",
  result: {
    title: "短标题",
    note: "新的摘要",
    folders: [{ folderId: null, name: "Inbox", reason: "暂存" }],
    tags: [{ tagId: "recommended", name: "推荐标签", reason: "推荐" }],
    newTags: [{ name: "Another", reason: "可复用主题" }],
  },
  rawText: "reply",
  durationMs: 20,
};
const events = [
  { type: "stage", stage: "prepare", message: "读取资料" },
  context,
  { type: "stage", stage: "request", message: "模型调用" },
  resultEvent,
];
function response(items: unknown[] = events) {
  return new Response(`${items.map((e) => JSON.stringify(e)).join("\n")}\n`, {
    headers: { "content-type": "application/x-ndjson" },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => response()),
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("shared AI editor state", () => {
  it("consumes real events, retains existing tags and selects Inbox explicitly", async () => {
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    expect(result.current.ready).toBe(true);
    expect(result.current.stage).toBe("ready");
    expect(result.current.selectedFolderId).toBeNull();
    expect(result.current.tags.filter((t) => t.checked).map((t) => t.name)).toEqual([
      "推荐标签",
      "已有标签",
    ]);
    expect(result.current.tags.find((tag) => tag.tagId === "recommended")?.checked).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(result.current.newTagSuggestions).toEqual(resultEvent.result.newTags);
    expect(result.current.notices).toEqual(context.notices);
    expect(result.current.draftTitle).toBe("短标题");
  });
  it("writes edited title/note and tag choices in one action", async () => {
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    act(() => {
      result.current.setDraftTitle("人工标题");
      result.current.setDraftNote("人工备注");
      result.current.toggleTag(1);
    });
    save.mockResolvedValue({
      success: true,
      data: {
        link: makeLink({ id: 1, title: "人工标题", note: "人工备注" }),
        tags: [{ id: "recommended", name: "推荐标签" }],
      },
    });
    await act(() => result.current.apply());
    expect(save).toHaveBeenCalledWith({
      linkId: 1,
      revision: 3,
      title: "人工标题",
      note: "人工备注",
      folderId: null,
      tagIds: ["recommended"],
    });
    expect(create).not.toHaveBeenCalled();
    expect(callbacks.onLinkTagRemoved).toHaveBeenCalledWith(1, "old");
    expect(callbacks.onLinkUpdated).toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });
  it("regenerates suggestions and handles empty folders fallback", async () => {
    const noFoldersResult = {
      ...resultEvent,
      result: {
        ...resultEvent.result,
        folders: [],
        newTags: undefined,
      },
    };
    vi.mocked(fetch).mockResolvedValue(response([context, noFoldersResult]));
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    expect(result.current.selectedFolderId).toBe("old-folder");
    expect(result.current.newTagSuggestions).toEqual([]);

    // Test regenerate callback
    vi.mocked(fetch).mockResolvedValue(response());
    await act(() => result.current.regenerate());
    expect(result.current.selectedFolderId).toBeNull();

    let resolveCreate: ((value: unknown) => void) | undefined;
    create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    let pendingAddTag: Promise<boolean> | undefined;
    act(() => {
      pendingAddTag = result.current.addTag("pending-tag");
    });
    expect(result.current.creatingTag).toBe(true);

    const addTagResult = await act(async () => result.current.addTag("another-one"));
    expect(addTagResult).toBe(false);

    act(() => {
      result.current.close();
    });
    expect(result.current.open).toBe(true);

    await act(async () => {
      resolveCreate?.({ success: true, data: { id: "p1", name: "pending-tag" } });
      await pendingAddTag;
    });
    expect(result.current.creatingTag).toBe(false);
  });
  it("covers stream parser buffer tail and missing response body error", async () => {
    // Response without body
    vi.mocked(fetch).mockResolvedValue(new Response(null));
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    expect(result.current.error).toBe("无法读取整理进度");

    // Event with trailing un-newline-terminated json buffer and stage rawText
    const stream = new ReadableStream({
      start(controller) {
        const text = `${JSON.stringify({ type: "stage", stage: "prepare", message: "prep", rawText: "raw1" })}\n${JSON.stringify({ type: "stage", stage: "request", message: "req", rawText: "raw2" })}`;
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { headers: { "content-type": "application/x-ndjson" } }),
    );
    await act(() => result.current.openForLink(1));
    expect(result.current.rawText).toBe("raw2");
  });
  it("handles missing context when result event arrives prematurely", async () => {
    vi.mocked(fetch).mockResolvedValue(response([resultEvent]));
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    expect(result.current.error).toBe("缺少来源资料状态，请重试");
  });
  it("guards apply and close while busy or not ready", async () => {
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    // Not ready and linkId null
    await act(() => result.current.apply());
    expect(save).not.toHaveBeenCalled();

    // Open link
    await act(() => result.current.openForLink(1));
    expect(result.current.ready).toBe(true);

    // Apply error rejection branch
    save.mockRejectedValueOnce(new Error("network error"));
    await act(() => result.current.apply());
    expect(result.current.error).toBe("保存失败，当前编辑内容已保留，请重试");
    expect(result.current.applying).toBe(false);

    // Close while open
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });
  it("handles non-Error objects in fetch catch and default error message on bad response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 500 }));
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    expect(result.current.error).toBe("获取建议失败");

    vi.mocked(fetch).mockRejectedValue("string error");
    await act(() => result.current.openForLink(1));
    expect(result.current.error).toBe("网络错误");
  });
  it("preserves draft title and note when regenerating", async () => {
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    act(() => {
      result.current.setDraftTitle("自定义标题");
      result.current.setDraftNote("自定义备注");
    });
    // regenerate with context event only
    vi.mocked(fetch).mockResolvedValue(response([context]));
    await act(() => result.current.openForLink(1, true));
    expect(result.current.draftTitle).toBe("自定义标题");
    expect(result.current.draftNote).toBe("自定义备注");
  });
  it("preserves the draft when a save fails", async () => {
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    act(() => result.current.setDraftNote("不能丢失"));
    save.mockResolvedValue({ success: false, error: "conflict" });
    await act(() => result.current.apply());
    expect(result.current.draftNote).toBe("不能丢失");
    expect(result.current.open).toBe(true);
    expect(result.current.error).toBe("conflict");
    expect(callbacks.onLinkUpdated).not.toHaveBeenCalled();
  });
  it("creates tags only after an explicit user action and reuses existing tags", async () => {
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    expect(create).not.toHaveBeenCalled();
    create.mockResolvedValue({ success: true, data: { id: "user-created", name: "Another" } });
    await act(() => result.current.addTag("Another"));
    await act(() => result.current.addTag("another"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ name: "Another" });
    expect(result.current.tags.filter((t) => t.name === "Another")).toHaveLength(1);
    expect(result.current.tags.find((t) => t.name === "Another")?.checked).toBe(true);
    expect(result.current.newTagSuggestions).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    expect(callbacks.onTagCreated).toHaveBeenCalledWith({ id: "user-created", name: "Another" });
  });
  it("retains the editor and reports failed manual tag creation", async () => {
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    await act(() => result.current.addTag(" "));
    expect(create).not.toHaveBeenCalled();
    create.mockResolvedValue({ success: false });
    await act(() => result.current.addTag("失败"));
    expect(result.current.tagError).toContain("创建失败");
    create.mockRejectedValue(new Error("offline"));
    await act(() => result.current.addTag("失败"));
    expect(result.current.creatingTag).toBe(false);
    expect(result.current.draftNote).toBe("新的摘要");
  });
  it("reports incomplete responses and keeps existing source notes", async () => {
    vi.mocked(fetch).mockResolvedValue(response(events.slice(0, 3)));
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toContain("连接中断");
    expect(result.current.draftNote).toBe("旧备注");
  });
  it("preserves manual text when regeneration fails", async () => {
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    act(() => result.current.setDraftNote("手改"));
    vi.mocked(fetch).mockResolvedValue(
      response([
        context,
        { type: "error", reason: "parse_error", message: "格式错误", rawText: "bad" },
      ]),
    );
    await act(() => result.current.openForLink(1, true));
    expect(result.current.draftNote).toBe("手改");
    expect(result.current.failedStep).toBe("parse");
  });
  it("cancels a closed request and ignores its late response", async () => {
    let resolve: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    let pending: Promise<void>;
    act(() => {
      pending = result.current.openForLink(1);
    });
    act(() => result.current.close());
    await act(async () => {
      resolve(response());
      await pending;
    });
    expect(result.current.open).toBe(false);
    expect(result.current.draftTitle).toBe("");
  });
  it("handles transport errors and configuration checks", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const { result } = renderHook(() => useSuggestLinkOrgViewModel(callbacks));
    await act(() => result.current.openForLink(1));
    expect(result.current.error).toBe("Unauthorized");
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect(failedSuggestStep("validation")).toBe("prepare");
    expect(failedSuggestStep("timeout")).toBe("request");
  });
});
