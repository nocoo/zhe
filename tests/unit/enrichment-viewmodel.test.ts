// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnrichmentTasksAction, retryEnrichmentTasksAction } from "@/actions/enrichment";
import { refreshLinkMetadata } from "@/actions/links/metadata";
import type { EnrichmentTask } from "@/models/connector-activity";
import type { Link } from "@/models/types";
import { useEnrichmentViewModel } from "@/viewmodels/useEnrichmentViewModel";

const { createdAt, mocks } = vi.hoisted(() => ({
  createdAt: new Date("2026-03-04T12:34:56.000Z"),
  mocks: {
    success: vi.fn(),
    danger: vi.fn(),
    info: vi.fn(),
    handleLinkUpdated: vi.fn(),
  },
}));

vi.mock("@/actions/enrichment", () => ({
  loadEnrichmentTasksAction: vi.fn(),
  retryEnrichmentTasksAction: vi.fn(),
}));
vi.mock("@/actions/links/metadata", () => ({ refreshLinkMetadata: vi.fn() }));
vi.mock("@nocoo/basalt/components/toast", () => ({ toast: mocks }));
vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardService: () => ({
    handleLinkUpdated: mocks.handleLinkUpdated,
  }),
}));

const task = (id: number, overrides: Partial<EnrichmentTask> = {}): EnrichmentTask => ({
  linkId: id,
  source: "x",
  title: `Post ${id}`,
  url: `https://x.com/example/status/${id}`,
  state: "failed",
  attempts: 5,
  nextAttemptAt: Date.now() + 60000,
  leaseUntil: 0,
  updatedAt: Date.now(),
  errorCode: "opencli_unavailable",
  connectorName: "tomato",
  textChars: 100,
  mediaCount: 1,
  mediaTotal: 2,
  archivedBytes: 1024,
  previewUrl: null,
  recordedFailures: 2,
  historyComplete: true,
  ...overrides,
});

const fixtures = [
  task(1),
  task(2, {
    source: "github",
    title: "Repository",
    state: "complete",
    attempts: 2,
    errorCode: null,
  }),
  task(3, { source: "screenshot", title: "Website", state: "partial", attempts: 1 }),
  task(4, { state: "running", leaseUntil: Date.now() + 300000 }),
  task(5, { state: "pending", attempts: 0 }),
  task(6, { state: "unavailable" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({ success: true, tasks: fixtures });
  vi.mocked(retryEnrichmentTasksAction).mockImplementation(async (ids) => ({
    success: true,
    queued: ids,
  }));
  vi.mocked(refreshLinkMetadata).mockResolvedValue({
    success: true,
    data: {
      id: 99,
      originalUrl: "https://example.com/new",
      title: "New page",
      createdAt,
    } as Link,
  });
});
afterEach(() => vi.useRealTimers());

describe("useEnrichmentViewModel", () => {
  it("polls while visible and stops polling after unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useEnrichmentViewModel({}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(loadEnrichmentTasksAction).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(loadEnrichmentTasksAction).toHaveBeenCalledTimes(2);
  });

  it("paginates and clears selection when filters or page change", async () => {
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({
      success: true,
      tasks: Array.from({ length: 42 }, (_, index) =>
        task(index + 1, { source: index < 40 ? "x" : "github" }),
      ),
    });
    const { result } = renderHook(() => useEnrichmentViewModel({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pages).toBe(2);
    act(() => result.current.toggle(1));
    expect(result.current.selectedIds).toEqual([1]);
    act(() => result.current.toggle(1));
    expect(result.current.selectedIds).toEqual([]);
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toHaveLength(40);
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([]);
    act(() => result.current.setPage(1));
    expect(result.current.visible).toHaveLength(2);
    act(() => result.current.setSource("github"));
    expect(result.current.currentPage).toBe(0);
    act(() => result.current.setState("retry"));
    expect(result.current.visible).toHaveLength(2);
    act(() => result.current.setState("complete"));
    expect(result.current.visible).toHaveLength(0);
    act(() => result.current.setSearch("repo"));
    expect(result.current.search).toBe("repo");
    act(() => result.current.setDetailId(2));
    expect(result.current.detailId).toBe(2);
  });

  it("retries queued tasks, skips stale selections, and reports failures", async () => {
    const { result } = renderHook(() => useEnrichmentViewModel({ source: "x" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.retry([]));
    expect(retryEnrichmentTasksAction).not.toHaveBeenCalled();

    await act(async () => result.current.retry([1, 3]));
    expect(mocks.success).toHaveBeenCalledWith("已将 2 条任务重新排队");

    vi.mocked(retryEnrichmentTasksAction).mockResolvedValueOnce({ success: true, queued: [] });
    await act(async () => result.current.retry([1]));
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining("已跳过"));

    vi.mocked(retryEnrichmentTasksAction).mockResolvedValueOnce({ success: false });
    await act(async () => result.current.retry([1]));
    expect(mocks.danger).toHaveBeenCalledWith(expect.stringContaining("重新排队失败"));
  });

  it("collects missing links, refreshes complete tasks, and guards active/error states", async () => {
    const { result } = renderHook(() => useEnrichmentViewModel({ linkId: 99 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Pending (5) and running (4) tasks must not collect
    await act(async () => {
      await result.current.collect(5);
      await result.current.collect(4);
    });
    expect(refreshLinkMetadata).not.toHaveBeenCalled();

    // Missing task (99) collects and syncs
    await act(async () => result.current.collect(99));
    expect(refreshLinkMetadata).toHaveBeenCalledWith(99);
    expect(mocks.handleLinkUpdated).toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledWith("已提交采集");

    // Complete task (2) refreshes and syncs
    const updatedRepo = {
      id: 2,
      originalUrl: "https://github.com/example/repo",
      title: "Repository",
      createdAt,
    } as Link;
    vi.mocked(refreshLinkMetadata).mockResolvedValueOnce({ success: true, data: updatedRepo });
    await act(async () => result.current.collect(2));
    expect(mocks.success).toHaveBeenCalledWith("已提交刷新");

    // Failures report distinct toasts without syncing
    vi.mocked(refreshLinkMetadata).mockResolvedValueOnce({ success: false, error: "Unauthorized" });
    await act(async () => result.current.collect(99));
    expect(mocks.danger).toHaveBeenCalledWith("采集失败，请稍后重试");

    vi.mocked(refreshLinkMetadata).mockResolvedValueOnce({ success: false });
    await act(async () => result.current.collect(2));
    expect(mocks.danger).toHaveBeenCalledWith("刷新失败，请稍后重试");
  });

  it("does not collect while tasks are loading or after a load error", async () => {
    let resolveLoad: (value: Awaited<ReturnType<typeof loadEnrichmentTasksAction>>) => void =
      () => {};
    vi.mocked(loadEnrichmentTasksAction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const { result } = renderHook(() => useEnrichmentViewModel({ linkId: 99 }));
    expect(result.current.loading).toBe(true);
    await act(async () => {
      await result.current.collect(99);
    });
    expect(refreshLinkMetadata).not.toHaveBeenCalled();
    await act(async () => {
      resolveLoad({ success: false });
    });
    await waitFor(() => expect(result.current.error).toBe(true));
    await act(async () => {
      await result.current.collect(99);
    });
    expect(refreshLinkMetadata).not.toHaveBeenCalled();
    expect(mocks.handleLinkUpdated).not.toHaveBeenCalled();
  });

  it("does not replace fresh data with an older request or update after unmount", async () => {
    let resolveOld: (value: Awaited<ReturnType<typeof loadEnrichmentTasksAction>>) => void =
      () => {};
    vi.mocked(loadEnrichmentTasksAction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useEnrichmentViewModel({}));
    await act(async () => result.current.refresh());
    await act(async () => resolveOld({ success: true, tasks: [] }));
    expect(result.current.tasks).toHaveLength(fixtures.length);
    unmount();
  });
});
