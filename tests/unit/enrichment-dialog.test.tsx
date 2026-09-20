// @vitest-environment happy-dom
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadXBookmarks } from "@/actions/connector";
import {
  loadEnrichmentEventsAction,
  loadEnrichmentTasksAction,
  retryEnrichmentTasksAction,
} from "@/actions/enrichment";
import { EnrichmentButton } from "@/components/dashboard/enrichment-button";
import { EnrichmentDetails } from "@/components/dashboard/enrichment-details";
import { EnrichmentDialog } from "@/components/dashboard/enrichment-dialog";
import type { EnrichmentEvent, EnrichmentTask } from "@/models/connector-activity";
import { useEnrichmentViewModel } from "@/viewmodels/useEnrichmentViewModel";

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  open: vi.fn(),
}));
vi.mock("@/actions/enrichment", () => ({
  loadEnrichmentTasksAction: vi.fn(),
  loadEnrichmentEventsAction: vi.fn(),
  retryEnrichmentTasksAction: vi.fn(),
}));
vi.mock("@/actions/connector", () => ({ loadXBookmarks: vi.fn() }));
vi.mock("@nocoo/basalt/components/toast", () => ({ toast: mocks }));
vi.mock("@/contexts/enrichment", () => ({ useOpenEnrichment: () => mocks.open }));
vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardService: () => ({
    links: [
      { id: 2, originalUrl: "https://github.com/example/repo", title: "Repository" },
      { id: 99, originalUrl: "https://example.com/new", title: "New page" },
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
    fireEvent.change(screen.getByRole("textbox", { name: "搜索补全记录" }), {
      target: { value: "Repository" },
    });
    expect(screen.queryByText("Post 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    expect(await screen.findByText("Repository README")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开原链接" })).toHaveAttribute(
      "href",
      fixtures[1]?.url,
    );
    fireEvent.click(screen.getByRole("button", { name: "全部记录" }));
    expect(screen.getByRole("textbox", { name: "搜索补全记录" })).toHaveValue("Repository");
    fireEvent.click(screen.getByRole("button", { name: "关闭补全记录" }));
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
    expect(await screen.findByText(/补全记录暂时无法读取/)).toBeInTheDocument();
    expect(await screen.findByText(/尚无执行记录/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开原链接" })).toHaveAttribute(
      "href",
      "https://example.com/new",
    );
    fireEvent.click(screen.getByRole("button", { name: "全部记录" }));
    vi.mocked(loadEnrichmentTasksAction).mockResolvedValue({ success: true, tasks: [] });
    fireEvent.click(screen.getByRole("button", { name: "刷新补全记录" }));
    expect(await screen.findByText("没有符合条件的补全记录")).toBeInTheDocument();
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

  it("offers source and per-card entries to the same dialog", () => {
    render(
      <>
        <EnrichmentButton source="github" />
        <EnrichmentButton linkId={5} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "补全记录" }));
    expect(mocks.open).toHaveBeenCalledWith({ source: "github" });
    fireEvent.click(screen.getByRole("button", { name: "查看补全记录" }));
    expect(mocks.open).toHaveBeenCalledWith({ linkId: 5 });
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
