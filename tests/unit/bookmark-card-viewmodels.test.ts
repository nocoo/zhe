// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookmarkAction } from "@/models/bookmark-actions";
import type { Link } from "@/models/types";
import type { BulkDeleteState } from "@/viewmodels/useBulkDelete";
import type { useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { makeLink } from "../fixtures";
import { unwrap } from "../test-utils";

const mocks = vi.hoisted(() => ({
  openEnrichment: vi.fn(),
  destroyCard: vi.fn().mockResolvedValue(undefined),
  setLinkHidden: vi.fn(),
  toastSuccess: vi.fn(),
  toastDanger: vi.fn(),
  handleCopy: vi.fn(),
  handleCopyOriginalUrl: vi.fn(),
  handleToggleAnalytics: vi.fn(),
  handleToggleHidden: vi.fn(),
  handleDelete: vi.fn(),
  handleFaviconError: vi.fn(),
  useLinkCardViewModel: vi.fn(),
}));

vi.mock("@/contexts/enrichment", () => ({
  useOpenEnrichment: () => mocks.openEnrichment,
}));

vi.mock("@/lib/motion", () => ({
  destroyCard: mocks.destroyCard,
}));

vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useLinkCardViewModel: mocks.useLinkCardViewModel,
}));

vi.mock("@/actions/links", () => ({
  setLinkHidden: mocks.setLinkHidden,
}));

vi.mock("@nocoo/basalt/components/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
    danger: mocks.toastDanger,
  },
}));

import { useBookmarkCardViewModel } from "@/viewmodels/useBookmarkCardViewModel";
import { useBulkLinkVisibility } from "@/viewmodels/useBulkLinkVisibility";
import { useGifPlayback } from "@/viewmodels/useGifPlayback";

type CardVmReturn = ReturnType<typeof useLinkCardViewModel>;

function makeBaseCardVm(overrides: Partial<CardVmReturn> = {}): CardVmReturn {
  return {
    shortUrl: "https://zhe.sh/abc123",
    isSavingVisibility: false,
    handleToggleHidden: mocks.handleToggleHidden,
    copied: false,
    copiedOriginalUrl: false,
    isDeleting: false,
    showAnalytics: false,
    analyticsStats: null,
    isLoadingAnalytics: false,
    handleCopy: mocks.handleCopy,
    handleCopyOriginalUrl: mocks.handleCopyOriginalUrl,
    handleDelete: mocks.handleDelete,
    handleToggleAnalytics: mocks.handleToggleAnalytics,
    screenshotUrl: null,
    faviconUrl: null,
    faviconError: false,
    handleFaviconError: mocks.handleFaviconError,
    ...overrides,
  };
}

function makeBulkSelection(overrides: Partial<BulkDeleteState> = {}): BulkDeleteState {
  return {
    active: true,
    selected: new Set<number>(),
    batch: null,
    toggle: vi.fn(),
    deselect: vi.fn(),
    close: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
    count: 0,
    total: 0,
    enter: vi.fn(),
    exit: vi.fn(),
    selectAll: vi.fn(),
    requestDelete: vi.fn(),
    ...overrides,
  };
}

function getAction(actions: BookmarkAction[], id: string): BookmarkAction {
  return unwrap(actions.find((action) => action.id === id));
}

describe("useBookmarkCardViewModel", () => {
  let capturedOnDeleted: ((id: number) => void | Promise<void>) | undefined;
  let vmState: CardVmReturn;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    capturedOnDeleted = undefined;
    vmState = makeBaseCardVm();
    mocks.useLinkCardViewModel.mockImplementation(
      (
        _link: Link,
        _siteUrl: string,
        onDeleted: (id: number) => void | Promise<void>,
      ): CardVmReturn => {
        capturedOnDeleted = onDeleted;
        return vmState;
      },
    );
  });

  it("builds default actions, runs handlers, and toggles dialog states", () => {
    const link = makeLink({ id: 42, isHidden: false });
    const onUpdate = vi.fn();
    const onDelete = vi.fn();
    const onSuggest = vi.fn();

    const { result } = renderHook(() =>
      useBookmarkCardViewModel({
        link,
        siteUrl: "https://zhe.sh",
        onUpdate,
        onDelete,
        onSuggest,
        suggestDisabled: false,
        editable: true,
      }),
    );

    const byId = {
      organize: getAction(result.current.actions, "organize"),
      copyOriginal: getAction(result.current.actions, "copy-original"),
      copyShort: getAction(result.current.actions, "copy-short"),
      edit: getAction(result.current.actions, "edit"),
      enrichment: getAction(result.current.actions, "enrichment"),
      analytics: getAction(result.current.actions, "analytics"),
      visibility: getAction(result.current.actions, "visibility"),
      delete: getAction(result.current.actions, "delete"),
    };

    expect(byId.organize.label).toBe("AI 整理");
    expect(byId.organize.disabled).toBe(false);
    expect(byId.organize.description).toBeUndefined();
    expect(byId.copyOriginal.label).toBe("复制原链接");
    expect(byId.copyShort.label).toBe("复制短链接");
    expect(byId.edit.disabled).toBe(false);
    expect(byId.visibility.label).toBe("隐藏帖子");
    expect(byId.visibility.disabled).toBe(false);
    expect(byId.visibility.pending).toBe(false);
    expect(byId.delete.destructive).toBe(true);
    expect(byId.delete.disabled).toBe(false);

    act(() => {
      byId.organize.run();
      byId.copyOriginal.run();
      byId.copyShort.run();
      byId.edit.run();
      byId.enrichment.run();
      byId.analytics.run();
      byId.visibility.run();
      byId.delete.run();
    });

    expect(onSuggest).toHaveBeenCalledTimes(1);
    expect(mocks.handleCopyOriginalUrl).toHaveBeenCalledTimes(1);
    expect(mocks.handleCopy).toHaveBeenCalledTimes(1);
    expect(result.current.editing).toBe(true);
    expect(mocks.openEnrichment).toHaveBeenCalledWith({ linkId: 42 });
    expect(mocks.handleToggleAnalytics).toHaveBeenCalledTimes(1);
    expect(mocks.handleToggleHidden).toHaveBeenCalledTimes(1);
    expect(result.current.confirmDelete).toBe(true);
  });

  it("reflects copied, hidden, disabled, and pending action variants", () => {
    vmState = makeBaseCardVm({
      copiedOriginalUrl: true,
      copied: true,
      isSavingVisibility: true,
      isDeleting: true,
    });
    const link = makeLink({ id: 7, isHidden: true });

    const { result, rerender } = renderHook(
      ({
        suggestDisabled,
        onSuggest,
      }: {
        suggestDisabled?: boolean | undefined;
        onSuggest?: (() => void) | undefined;
      }) =>
        useBookmarkCardViewModel({
          link,
          siteUrl: "https://zhe.sh",
          onUpdate: vi.fn(),
          onDelete: vi.fn(),
          onSuggest,
          suggestDisabled,
          editable: false,
        }),
      {
        initialProps: { suggestDisabled: false, onSuggest: undefined as (() => void) | undefined },
      },
    );

    let organize = getAction(result.current.actions, "organize");
    const copyOriginal = getAction(result.current.actions, "copy-original");
    const copyShort = getAction(result.current.actions, "copy-short");
    const edit = getAction(result.current.actions, "edit");
    const visibility = getAction(result.current.actions, "visibility");
    const del = getAction(result.current.actions, "delete");

    expect(organize.disabled).toBe(true);
    expect(organize.description).toBe("请先在设置中配置 AI");
    expect(copyOriginal.label).toBe("已复制原链接");
    expect(copyShort.label).toBe("已复制短链接");
    expect(edit.disabled).toBe(true);
    expect(visibility.label).toBe("取消隐藏");
    expect(visibility.disabled).toBe(true);
    expect(visibility.pending).toBe(true);
    expect(del.disabled).toBe(true);

    // Clicking organize when onSuggest is undefined safely no-ops
    organize.run();

    rerender({ suggestDisabled: true, onSuggest: vi.fn() });
    organize = getAction(result.current.actions, "organize");
    expect(organize.disabled).toBe(true);
    expect(organize.description).toBe("请先在设置中配置 AI");
  });

  it("restores focus to next sibling, previous sibling, or bulk toggle after deletion", async () => {
    const onDelete = vi.fn();
    const link = makeLink({ id: 99 });

    const { result } = renderHook(() =>
      useBookmarkCardViewModel({
        link,
        siteUrl: "https://zhe.sh",
        onUpdate: vi.fn(),
        onDelete,
        editable: true,
      }),
    );

    const container = document.createElement("div");
    const prevItem = document.createElement("div");
    prevItem.setAttribute("data-card-layout-item", "");
    const prevButton = document.createElement("button");
    prevButton.setAttribute("aria-label", "更多收藏操作");
    const prevFocus = vi.spyOn(prevButton, "focus");
    prevItem.appendChild(prevButton);

    const currentItem = document.createElement("div");
    currentItem.setAttribute("data-card-layout-item", "");
    const cardEl = document.createElement("div");
    currentItem.appendChild(cardEl);

    const nextItem = document.createElement("div");
    nextItem.setAttribute("data-card-layout-item", "");
    const nextButton = document.createElement("button");
    nextButton.setAttribute("aria-label", "更多收藏操作");
    const nextFocus = vi.spyOn(nextButton, "focus");
    nextItem.appendChild(nextButton);

    const multiButton = document.createElement("button");
    multiButton.setAttribute("aria-label", "多选卡片");
    const multiFocus = vi.spyOn(multiButton, "focus");

    container.append(prevItem, currentItem, nextItem);
    document.body.append(container, multiButton);
    (result.current.card as { current: HTMLDivElement | null }).current = cardEl;

    // 1. Focus moves to next sibling's menu trigger
    await act(async () => {
      result.current.setConfirmDelete(true);
      await capturedOnDeleted?.(99);
    });
    expect(mocks.destroyCard).toHaveBeenCalledWith(cardEl);
    expect(result.current.confirmDelete).toBe(false);
    expect(onDelete).toHaveBeenCalledWith(99);
    expect(nextFocus).toHaveBeenCalledWith({ preventScroll: true });

    // 2. Remove next sibling -> focus moves to previous sibling's menu trigger
    nextItem.remove();
    await act(async () => {
      await capturedOnDeleted?.(99);
    });
    expect(prevFocus).toHaveBeenCalledWith({ preventScroll: true });

    // 3. Remove previous sibling trigger -> falls back to bulk selection toggle
    prevButton.remove();
    await act(async () => {
      await capturedOnDeleted?.(99);
    });
    expect(multiFocus).toHaveBeenCalledWith({ preventScroll: true });

    // 4. Null card ref & no fallback button -> completes cleanly without throwing
    (result.current.card as { current: HTMLDivElement | null }).current = null;
    multiButton.remove();
    await act(async () => {
      await capturedOnDeleted?.(99);
    });
    expect(mocks.destroyCard).toHaveBeenCalledWith(null);
  });
});

describe("useBulkLinkVisibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores updates when batch is active, selection is empty, or update is in flight", async () => {
    const firstLink = makeLink({ id: 1, isHidden: false });
    const links = [firstLink];
    const onUpdated = vi.fn();

    const batchSelection = makeBulkSelection({
      selected: new Set([1]),
      batch: { phase: "confirm", items: [], processed: 0, failures: [] },
    });
    const { result: batchHook } = renderHook(() =>
      useBulkLinkVisibility(batchSelection, links, onUpdated),
    );
    await act(async () => {
      await batchHook.current.update(true);
    });
    expect(mocks.setLinkHidden).not.toHaveBeenCalled();

    const emptySelection = makeBulkSelection({ selected: new Set([999]) });
    const { result: emptyHook } = renderHook(() =>
      useBulkLinkVisibility(emptySelection, links, onUpdated),
    );
    await act(async () => {
      await emptyHook.current.update(true);
    });
    expect(mocks.setLinkHidden).not.toHaveBeenCalled();

    let resolveHidden!: (value: { success: true; data: Link }) => void;
    mocks.setLinkHidden.mockReturnValue(
      new Promise((resolve) => {
        resolveHidden = resolve;
      }),
    );

    const activeSelection = makeBulkSelection({ selected: new Set([1]) });
    const { result: inflightHook } = renderHook(() =>
      useBulkLinkVisibility(activeSelection, links, onUpdated),
    );

    let firstCall!: Promise<void>;
    await act(async () => {
      firstCall = inflightHook.current.update(true);
      await inflightHook.current.update(true);
    });
    expect(mocks.setLinkHidden).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveHidden({ success: true, data: { ...firstLink, isHidden: true } });
      await firstCall;
    });
    expect(inflightHook.current.pending).toBe(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已隐藏 1 项");
  });

  it("skips already-matching items, updates mismatched items, and handles failures", async () => {
    const link1 = makeLink({ id: 1, isHidden: true });
    const link2 = makeLink({ id: 2, isHidden: false });
    const link3 = makeLink({ id: 3, isHidden: false });
    const link4 = makeLink({ id: 4, isHidden: false });
    const links = [link1, link2, link3, link4];
    const onUpdated = vi.fn();
    const deselect = vi.fn();

    // Hide flow: id 1 skipped (already hidden), id 2 updated
    mocks.setLinkHidden.mockResolvedValueOnce({
      success: true,
      data: { ...link2, isHidden: true },
    });
    const hideSelection = makeBulkSelection({
      selected: new Set([1, 2]),
      deselect,
    });
    const { result: hideHook } = renderHook(() =>
      useBulkLinkVisibility(hideSelection, links, onUpdated),
    );
    await act(async () => {
      await hideHook.current.update(true);
    });
    expect(mocks.setLinkHidden).toHaveBeenCalledTimes(1);
    expect(mocks.setLinkHidden).toHaveBeenCalledWith(2, true);
    expect(onUpdated).toHaveBeenCalledWith({ ...link2, isHidden: true });
    expect(deselect).toHaveBeenCalledWith(1);
    expect(deselect).toHaveBeenCalledWith(2);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已隐藏 2 项");

    // Unhide flow: id 1 updated to false
    vi.clearAllMocks();
    mocks.setLinkHidden.mockResolvedValueOnce({
      success: true,
      data: { ...link1, isHidden: false },
    });
    const unhideSelection = makeBulkSelection({
      selected: new Set([1]),
      deselect,
    });
    const { result: unhideHook } = renderHook(() =>
      useBulkLinkVisibility(unhideSelection, links, onUpdated),
    );
    await act(async () => {
      await unhideHook.current.update(false);
    });
    expect(mocks.setLinkHidden).toHaveBeenCalledWith(1, false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已解除隐藏 1 项");

    // Failure flow: { success: false }, missing data, and rejected call
    vi.clearAllMocks();
    mocks.setLinkHidden
      .mockResolvedValueOnce({ success: false, error: "denied" })
      .mockResolvedValueOnce({ success: true, data: undefined })
      .mockRejectedValueOnce(new Error("network"));
    const failSelection = makeBulkSelection({
      selected: new Set([2, 3, 4]),
      deselect,
    });
    const { result: failHook } = renderHook(() =>
      useBulkLinkVisibility(failSelection, links, onUpdated),
    );
    await act(async () => {
      await failHook.current.update(true);
    });
    expect(deselect).not.toHaveBeenCalled();
    expect(mocks.toastDanger).toHaveBeenCalledWith("3 项更新失败，请重试");
  });
});

describe("useGifPlayback", () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
  let observerCallback: IntersectionObserverCallback | null = null;
  let observeMock = vi.fn();
  let disconnectMock = vi.fn();
  let observerConstructCount = 0;

  beforeEach(() => {
    observerCallback = null;
    observeMock = vi.fn();
    disconnectMock = vi.fn();
    observerConstructCount = 0;

    globalThis.IntersectionObserver = class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerConstructCount++;
        observerCallback = callback;
      }
      root = null;
      rootMargin = "";
      scrollMargin = "";
      thresholds = [];
      observe = observeMock;
      unobserve = vi.fn();
      disconnect = disconnectMock;
      takeRecords = () => [];
    };

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
    if (originalVisibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
    }
    vi.restoreAllMocks();
  });

  it("does not observe when url is null, failed is true, or video ref is null", () => {
    renderHook(() => useGifPlayback("https://example.com/no-ref.gif", false));
    expect(observerConstructCount).toBe(0);

    const video = document.createElement("video");
    const { result, rerender } = renderHook(
      ({ url, failed }: { url: string | null; failed: boolean }) => useGifPlayback(url, failed),
      { initialProps: { url: null as string | null, failed: false } },
    );
    expect(observerConstructCount).toBe(0);

    (result.current as { current: HTMLVideoElement | null }).current = video;
    rerender({ url: "https://example.com/a.gif", failed: true });
    expect(observerConstructCount).toBe(0);
  });

  it("lazy-loads src, plays when visible and intersecting, pauses otherwise, and cleans up", () => {
    const video = document.createElement("video");
    const playMock = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("autoplay blocked"));
    const pauseMock = vi.fn();
    Object.defineProperty(video, "play", { value: playMock, configurable: true });
    Object.defineProperty(video, "pause", { value: pauseMock, configurable: true });

    const { result, rerender, unmount } = renderHook(
      ({ url, failed }: { url: string | null; failed: boolean }) => useGifPlayback(url, failed),
      { initialProps: { url: null as string | null, failed: false } },
    );

    (result.current as { current: HTMLVideoElement | null }).current = video;
    rerender({ url: "https://example.com/demo.gif", failed: false });

    expect(observerConstructCount).toBe(1);
    expect(observeMock).toHaveBeenCalledWith(video);

    // Intersecting + visible -> sets src once and calls play()
    observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(video.getAttribute("src")).toBe("https://example.com/demo.gif");
    expect(playMock).toHaveBeenCalledTimes(1);

    // Second intersecting trigger -> src already set, rejected play() is caught silently
    observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(playMock).toHaveBeenCalledTimes(2);

    // Hidden document -> calls pause()
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pauseMock).toHaveBeenCalledTimes(1);

    // Not intersecting & empty entries fallback -> calls pause()
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    observerCallback?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    observerCallback?.([], {} as IntersectionObserver);
    expect(pauseMock).toHaveBeenCalledTimes(3);

    unmount();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(pauseMock).toHaveBeenCalledTimes(4);
  });
});
