// @vitest-environment happy-dom
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadXBookmarks } from "@/actions/connector";
import {
  loadEnrichmentEventsAction,
  loadEnrichmentTasksAction,
  retryEnrichmentTasksAction,
} from "@/actions/enrichment";
import { refreshLinkMetadata } from "@/actions/links/metadata";
import { EnrichmentButton } from "@/components/dashboard/enrichment-button";
import { EnrichmentDetails } from "@/components/dashboard/enrichment-details";
import { EnrichmentDialog } from "@/components/dashboard/enrichment-dialog";
import type { EnrichmentEvent, EnrichmentTask } from "@/models/connector-activity";
import type { Link } from "@/models/types";
import { useEnrichmentViewModel } from "@/viewmodels/useEnrichmentViewModel";

const { createdAt, mocks } = vi.hoisted(() => ({
  createdAt: new Date("2026-03-04T12:34:56.000Z"),
  mocks: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    open: vi.fn(),
    handleLinkUpdated: vi.fn(),
  },
}));
vi.mock("@/actions/enrichment", () => ({
  loadEnrichmentTasksAction: vi.fn(),
  loadEnrichmentEventsAction: vi.fn(),
  retryEnrichmentTasksAction: vi.fn(),
}));
vi.mock("@/actions/links/metadata", () => ({ refreshLinkMetadata: vi.fn() }));
vi.mock("@/actions/connector", () => ({ loadXBookmarks: vi.fn() }));
vi.mock("@nocoo/basalt/components/toast", () => ({ toast: mocks }));
vi.mock("@/contexts/enrichment", () => ({ useOpenEnrichment: () => mocks.open }));
vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardService: () => ({
    handleLinkUpdated: mocks.handleLinkUpdated,
    links: [
      {
        id: 2,
        originalUrl: "https://github.com/example/repo",
        title: "Repository",
        createdAt,
      },
      {
        id: 99,
        originalUrl: "https://example.com/new",
        title: "New page",
        createdAt,
      },
    ],
  }),
}));
vi.mock("@/components/dashboard/github-repository-card", () => ({
  GitHubReadme: () => <p>Repository README</p>,
}));
vi.mock("@/components/dashboard/x-bookmark-content", () => ({
  XBookmarkContent: () => <p>Captured X content</p>,
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
const event = (id: number, overrides: Partial<EnrichmentEvent> = {}): EnrichmentEvent => ({
  id,
  source: "x",
  kind: "finished",
  state: "failed",
  attempts: 2,
  errorCode: "opencli_unavailable",
  connectorName: "tomato",
  textChars: 100,
  mediaCount: 1,
  mediaTotal: 2,
  archivedBytes: 1024,
  createdAt: Date.now(),
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
  vi.mocked(loadEnrichmentEventsAction).mockResolvedValue({
    success: true,
    events: [event(1)],
    more: false,
  });
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
  vi.mocked(loadXBookmarks).mockResolvedValue({ success: true, data: [] });
});
afterEach(() => vi.useRealTimers());

describe("enrichment operations dialog", () => {
  it("selects only retryable tasks and confirms the actual requeue count", async () => {
    const close = vi.fn();
    render(<EnrichmentDialog scope={{}} onClose={close} />);
    expect(await screen.findByText("Post 1")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "选择 Post 4" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "选择 Repository" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "选择本页可重试任务" }));
    expect(screen.getByText("已选 3 条")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新补全所选 (3)" }));
    await waitFor(() => expect(retryEnrichmentTasksAction).toHaveBeenCalledWith([1, 3, 6]));
    expect(mocks.success).toHaveBeenCalledWith("已将 3 条任务重新排队");
    fireEvent.change(screen.getByRole("textbox", { name: "搜索采集记录" }), {
      target: { value: "Repository" },
    });
    expect(screen.queryByText("Post 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    expect(await screen.findByText("Repository README")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开原链接" })).toHaveAttribute(
      "href",
      fixtures[1]?.url,
    );
    expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled();
    expect(document.querySelector("time")).toHaveAttribute("dateTime", createdAt.toISOString());
    expect(document.querySelector("time")).toHaveTextContent(createdAt.toLocaleString("zh-CN"));
    fireEvent.click(screen.getByRole("button", { name: "全部记录" }));
    expect(screen.getByRole("textbox", { name: "搜索采集记录" })).toHaveValue("Repository");
    fireEvent.click(screen.getByRole("button", { name: "关闭数据采集" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("opens one task, shows historical uncertainty, and retries with visible buttons", async () => {
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({
      success: true,
      tasks: [task(1, { historyComplete: false })],
    });
    render(<EnrichmentDialog scope={{ linkId: 1 }} onClose={vi.fn()} />);
    expect(await screen.findByText(/早期逐次记录缺失/)).toBeInTheDocument();
    expect(screen.getByText("已达自动重试上限")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新补全" }));
    await waitFor(() => expect(retryEnrichmentTasksAction).toHaveBeenCalledWith([1]));
    expect(screen.getByRole("region", { name: "执行记录" })).toHaveTextContent("tomato");
  });

  it("shows missing records and recoverable load failures", async () => {
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({ success: false });
    vi.mocked(loadEnrichmentEventsAction).mockResolvedValue({
      success: true,
      events: [],
      more: false,
    });
    render(<EnrichmentDialog scope={{ linkId: 99 }} onClose={vi.fn()} />);
    expect(await screen.findByText(/采集记录暂时无法读取/)).toBeInTheDocument();
    expect(await screen.findByText(/尚无执行记录/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "采集" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开原链接" })).toHaveAttribute(
      "href",
      "https://example.com/new",
    );
    fireEvent.click(screen.getByRole("button", { name: "全部记录" }));
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({ success: true, tasks: [] });
    fireEvent.click(screen.getByRole("button", { name: "刷新采集记录" }));
    expect(await screen.findByText("没有符合条件的采集记录")).toBeInTheDocument();
  });

  it("loads older events without discarding results and renders each result type", async () => {
    vi.mocked(loadEnrichmentEventsAction)
      .mockResolvedValueOnce({
        success: true,
        events: [
          event(5, { kind: "snapshot" }),
          event(4, { kind: "queued", attempts: 0 }),
          event(3, { kind: "started", source: "github" }),
        ],
        more: true,
      })
      .mockResolvedValueOnce({
        success: true,
        events: [
          event(2, {
            state: "complete",
            errorCode: null,
            source: "screenshot",
            mediaCount: 1,
            archivedBytes: 0,
          }),
          event(1, { source: "github", state: "complete", errorCode: null }),
        ],
        more: false,
      });
    const view = render(
      <EnrichmentDetails
        linkId={3}
        task={task(3, { source: "screenshot", previewUrl: "https://cdn.example.com/site.webp" })}
        link={undefined}
      />,
    );
    expect(await screen.findByText("已有状态快照")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加载更早记录" }));
    expect(await screen.findByText("截图 1 张")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    vi.mocked(loadEnrichmentEventsAction).mockResolvedValueOnce({
      success: true,
      events: [event(6)],
      more: true,
    });
    view.rerender(
      <EnrichmentDetails
        linkId={3}
        task={task(3, { source: "screenshot", previewUrl: "https://cdn.example.com/site.webp" })}
        link={undefined}
      />,
    );
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(6));
    expect(screen.queryByRole("button", { name: "加载更早记录" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "已保存的网站截图" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/site.webp",
    );
    vi.mocked(loadXBookmarks).mockResolvedValue({
      success: true,
      data: [
        {
          linkId: 1,
          state: "complete",
          tweet: { id: "1" },
          updatedAt: 1,
          errorCode: null,
        } as never,
      ],
    });
    view.rerender(<EnrichmentDetails linkId={1} task={task(1)} link={undefined} />);
    expect(await screen.findByText("Captured X content")).toBeInTheDocument();
  });

  it("reports history and content errors without erasing the visible task", async () => {
    vi.mocked(loadEnrichmentEventsAction).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(loadXBookmarks).mockRejectedValueOnce(new Error("offline"));
    render(<EnrichmentDetails linkId={1} task={task(1)} link={undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法读取");
  });

  it("handles loadMore error branch in EnrichmentDetails", async () => {
    let rejectLoadMore!: (err: Error) => void;
    const loadMorePromise = new Promise<Awaited<ReturnType<typeof loadEnrichmentEventsAction>>>(
      (_, reject) => {
        rejectLoadMore = reject;
      },
    );

    vi.mocked(loadEnrichmentEventsAction)
      .mockResolvedValueOnce({
        success: true,
        events: [event(1)],
        more: true,
      })
      .mockReturnValueOnce(loadMorePromise);

    render(<EnrichmentDetails linkId={1} task={task(1)} link={undefined} />);
    const loadMoreBtn = await screen.findByRole("button", { name: "加载更早记录" });
    fireEvent.click(loadMoreBtn);

    // Assert busy state
    expect(loadMoreBtn).toBeDisabled();

    // Settle promise with rejection
    act(() => {
      rejectLoadMore(new Error("loadMore network error"));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法读取");
    expect(loadMoreBtn).not.toBeDisabled();
  });

  it("starts collection when a link exists without a task", async () => {
    const updated = {
      id: 99,
      originalUrl: "https://example.com/new",
      title: "Collected page",
      createdAt,
    } as Link;
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({ success: true, tasks: [] });
    vi.mocked(refreshLinkMetadata).mockResolvedValue({ success: true, data: updated });
    render(<EnrichmentDialog scope={{ linkId: 99 }} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "采集" }));
    await waitFor(() => expect(refreshLinkMetadata).toHaveBeenCalledWith(99));
    expect(retryEnrichmentTasksAction).not.toHaveBeenCalled();
    expect(mocks.handleLinkUpdated).toHaveBeenCalledWith(updated);
    expect(mocks.success).toHaveBeenCalledWith("已提交采集");
    expect(document.querySelector("time")).toHaveAttribute("dateTime", createdAt.toISOString());
  });

  it("refreshes a complete task and syncs the updated link", async () => {
    const updated = {
      id: 2,
      originalUrl: "https://github.com/example/repo",
      title: "Repository",
      createdAt,
    } as Link;
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({
      success: true,
      tasks: [
        task(2, { source: "github", title: "Repository", state: "complete", errorCode: null }),
      ],
    });
    vi.mocked(refreshLinkMetadata).mockResolvedValue({ success: true, data: updated });
    render(<EnrichmentDialog scope={{ linkId: 2 }} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "刷新" }));
    await waitFor(() => expect(refreshLinkMetadata).toHaveBeenCalledWith(2));
    expect(retryEnrichmentTasksAction).not.toHaveBeenCalled();
    expect(mocks.handleLinkUpdated).toHaveBeenCalledWith(updated);
    expect(mocks.success).toHaveBeenCalledWith("已提交刷新");
  });

  it("does not collect or retry an active pending or running task", async () => {
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({
      success: true,
      tasks: [
        task(5, { state: "pending", attempts: 0, errorCode: null }),
        task(4, { state: "running", leaseUntil: Date.now() + 300000, errorCode: null }),
      ],
    });
    const view = render(<EnrichmentDialog scope={{ linkId: 5 }} onClose={vi.fn()} />);
    expect(await screen.findByText("等待补全")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "采集" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新补全" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全部记录" }));
    fireEvent.click(
      within(screen.getByTestId("enrichment-task-4")).getByRole("button", { name: "详情" }),
    );
    expect(await screen.findByText("正在补全")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新补全" })).not.toBeInTheDocument();
    view.unmount();
    const { result } = renderHook(() => useEnrichmentViewModel({ linkId: 5 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.collect(5);
      await result.current.collect(4);
    });
    expect(refreshLinkMetadata).not.toHaveBeenCalled();
    expect(retryEnrichmentTasksAction).not.toHaveBeenCalled();
  });

  it("retries failed, partial, unavailable and expired running tasks", async () => {
    const expired = Date.now() - 1000;
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({
      success: true,
      tasks: [
        task(1),
        task(3, { source: "screenshot", title: "Website", state: "partial", attempts: 1 }),
        task(6, { state: "unavailable" }),
        task(7, { state: "running", leaseUntil: expired, title: "Expired" }),
      ],
    });
    render(<EnrichmentDialog scope={{ linkId: 1 }} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "重新补全" }));
    await waitFor(() => expect(retryEnrichmentTasksAction).toHaveBeenCalledWith([1]));
    expect(refreshLinkMetadata).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "全部记录" }));
    fireEvent.click(
      within(screen.getByTestId("enrichment-task-7")).getByRole("button", { name: "详情" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "重新补全" }));
    await waitFor(() => expect(retryEnrichmentTasksAction).toHaveBeenCalledWith([7]));
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

  it("reports collection failure without syncing the dashboard link", async () => {
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({ success: true, tasks: [] });
    vi.mocked(refreshLinkMetadata).mockResolvedValue({ success: false, error: "Unauthorized" });
    render(<EnrichmentDialog scope={{ linkId: 99 }} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "采集" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("采集失败，请稍后重试"));
    expect(mocks.handleLinkUpdated).not.toHaveBeenCalled();
    vi.mocked(refreshLinkMetadata).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "采集" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(2));
    expect(mocks.handleLinkUpdated).not.toHaveBeenCalled();
  });

  it("reports complete-task refresh failure without syncing", async () => {
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({
      success: true,
      tasks: [
        task(2, { source: "github", title: "Repository", state: "complete", errorCode: null }),
      ],
    });
    vi.mocked(refreshLinkMetadata).mockResolvedValue({ success: false });
    render(<EnrichmentDialog scope={{ linkId: 2 }} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "刷新" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("刷新失败，请稍后重试"));
    expect(mocks.handleLinkUpdated).not.toHaveBeenCalled();
  });

  it("disables stale detail actions when polling fails and restores them after recovery", async () => {
    vi.useFakeTimers();
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({
      success: true,
      tasks: [task(2, { state: "complete", errorCode: null })],
    });
    render(<EnrichmentDialog scope={{ linkId: 2 }} onClose={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled();
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValueOnce({ success: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByRole("button", { name: "刷新" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("采集记录暂时无法读取");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled();
  });

  it("offers global and source-scoped history entries", () => {
    const { rerender } = render(<EnrichmentButton source="github" />);
    fireEvent.click(screen.getByRole("button", { name: "补全记录" }));
    expect(mocks.open).toHaveBeenCalledWith({ source: "github" });
    rerender(<EnrichmentButton />);
    fireEvent.click(screen.getByRole("button", { name: "补全记录" }));
    expect(mocks.open).toHaveBeenCalledWith({});
  });
});

describe("enrichment selection and refresh", () => {
  it("polls while visible and stops polling after closing", async () => {
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
  });

  it("handles stale selections and failed retries", async () => {
    const { result } = renderHook(() => useEnrichmentViewModel({ source: "x" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.retry([]));
    expect(retryEnrichmentTasksAction).not.toHaveBeenCalled();
    vi.mocked(retryEnrichmentTasksAction).mockResolvedValueOnce({ success: true, queued: [] });
    await act(async () => result.current.retry([1]));
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining("已跳过"));
    vi.mocked(retryEnrichmentTasksAction).mockResolvedValueOnce({ success: false });
    await act(async () => result.current.retry([1]));
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("重新排队失败"));
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
