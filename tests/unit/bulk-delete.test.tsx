// @vitest-environment happy-dom
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkDeleteActions, SelectableCard } from "@/components/dashboard/bulk-delete";
import { IdeasContent } from "@/components/dashboard/ideas-page-parts/ideas-content";
import type { IdeaListItem } from "@/lib/db/scoped";
import { useBulkDelete } from "@/viewmodels/useBulkDelete";
import type { IdeasViewModel } from "@/viewmodels/useIdeasViewModel";
import { makeIdea } from "../fixtures";

const items = [
  { id: 1, label: "First" },
  { id: 2, label: "Second" },
  { id: 3, label: "Third" },
];

describe("bulk deletion", () => {
  it.each(["grid", "list"] as const)("selects ideas in %s mode after loading", async (viewMode) => {
    const navigate = vi.fn();
    const create = vi.fn();
    const idea = makeIdea({ id: 1, title: "Saved idea" });
    function Collection({ loading, ideas }: { loading: boolean; ideas: IdeaListItem[] }) {
      const selection = useBulkDelete(
        ideas.map((item) => ({ id: item.id, label: item.title || "Idea" })),
        vi.fn(),
      );
      const vm = {
        loading,
        ideas,
        viewMode,
        tags: [],
        searchQuery: "",
        selectedTagId: null,
        setIsCreateModalOpen: create,
        confirmDelete: vi.fn(),
      } as unknown as IdeasViewModel;
      return (
        <>
          <BulkDeleteActions selection={selection} />
          <IdeasContent vm={vm} selection={selection} onNavigateToIdea={navigate} />
        </>
      );
    }
    const user = userEvent.setup();
    const { rerender } = render(<Collection loading ideas={[]} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    rerender(<Collection loading={false} ideas={[]} />);
    await user.click(screen.getByRole("button", { name: "新想法" }));
    expect(create).toHaveBeenCalledWith(true);
    rerender(<Collection loading={false} ideas={[idea]} />);
    await user.click(screen.getByRole("button", { name: "打开想法 Saved idea" }));
    expect(navigate).toHaveBeenCalledWith(idea);
    await user.click(screen.getByRole("button", { name: "多选卡片" }));
    const checkbox = screen.getByRole("checkbox", { name: "选择 Saved idea" });
    await user.click(checkbox);
    expect(screen.getByRole("status")).toHaveTextContent("已选 1 项");
    await user.click(checkbox);
    expect(screen.getByRole("status")).toHaveTextContent("已选 0 项");
  });

  it("shows failure details and retries only failed items from the result dialog", async () => {
    const remove = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: "Retry this item" })
      .mockResolvedValue({ success: true });
    function Collection() {
      return <BulkDeleteActions selection={useBulkDelete(items, remove)} />;
    }
    const user = userEvent.setup();
    render(<Collection />);
    await user.click(screen.getByRole("button", { name: "多选卡片" }));
    await user.click(screen.getByRole("button", { name: "全选当前列表" }));
    await user.click(screen.getByRole("button", { name: "删除所选" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "删除所选" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(await screen.findByRole("list", { name: "删除失败的内容" })).toHaveTextContent(
      "FirstRetry this item",
    );
    await user.click(screen.getByRole("button", { name: "重试失败项" }));
    await waitFor(() => expect(remove.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 1]));
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps failures open and closes one second after a successful retry", async () => {
    vi.useFakeTimers();
    try {
      const remove = vi
        .fn()
        .mockResolvedValueOnce({ success: false })
        .mockResolvedValue({ success: true });
      const { result, unmount } = renderHook(() => useBulkDelete(items.slice(0, 1), remove));
      act(() => {
        result.current.enter();
        result.current.selectAll();
      });
      act(() => result.current.requestDelete());
      await act(async () => result.current.execute());
      act(() => vi.advanceTimersByTime(3000));
      expect(result.current.batch?.failures).toHaveLength(1);
      expect(result.current.active).toBe(true);
      await act(async () => result.current.execute());
      act(() => vi.advanceTimersByTime(999));
      expect(result.current.batch?.phase).toBe("done");
      expect(result.current.active).toBe(true);
      act(() => vi.advanceTimersByTime(1));
      expect(result.current.batch).toBeNull();
      expect(result.current.active).toBe(false);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for each deletion, blocks duplicate execution, and retries only failures", async () => {
    let finish: (value: { success: boolean }) => void = () => {};
    const remove = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ success: false, error: "denied" });
    const { result } = renderHook(() => useBulkDelete(items, remove));
    act(() => {
      result.current.enter();
      result.current.selectAll();
    });
    act(() => result.current.requestDelete());
    let running = Promise.resolve();
    act(() => {
      running = result.current.execute();
    });
    expect(remove).toHaveBeenCalledTimes(1);
    act(() => {
      void result.current.execute();
      result.current.close();
      result.current.exit();
    });
    expect(result.current.batch?.phase).toBe("running");
    expect(result.current.active).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ success: true });
      await running;
    });
    expect(remove.mock.calls.map(([id]) => id)).toEqual([1, 2, 3]);
    expect(result.current.batch).toMatchObject({ phase: "done", processed: 3 });
    expect(result.current.batch?.failures.map(({ id }) => id)).toEqual([2, 3]);
    expect([...result.current.selected]).toEqual([2, 3]);
    remove.mockResolvedValue({ success: true });
    await act(async () => {
      await result.current.execute();
    });
    expect(remove.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 2, 3]);
    act(() => result.current.close());
    expect(result.current.active).toBe(false);
    expect(result.current.batch).toBeNull();
  });

  it("drops items hidden by filters and cancels without deleting", () => {
    const remove = vi.fn();
    const { result, rerender } = renderHook(({ visible }) => useBulkDelete(visible, remove), {
      initialProps: { visible: items },
    });
    act(() => {
      result.current.enter();
      result.current.selectAll();
    });
    rerender({ visible: items.slice(1, 2) });
    expect(result.current.count).toBe(1);
    act(() => result.current.requestDelete());
    expect(result.current.batch?.items.map(({ id }) => id)).toEqual([2]);
    act(() => result.current.close());
    expect(remove).not.toHaveBeenCalled();
    rerender({ visible: items });
    expect(result.current.count).toBe(1);
    act(() => result.current.exit());
    expect(result.current.count).toBe(0);
  });

  it("selects cards by keyboard, confirms, shows progress, and stays open until completion", async () => {
    let finish: (value: { success: boolean }) => void = () => {};
    const remove = vi.fn(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          finish = resolve;
        }),
    );
    function Collection() {
      const selection = useBulkDelete(items, remove);
      return (
        <>
          <BulkDeleteActions selection={selection} />
          {items.map((item) => (
            <SelectableCard key={item.id} selection={selection} itemId={item.id} label={item.label}>
              <a href="/original">{item.label}</a>
            </SelectableCard>
          ))}
        </>
      );
    }
    const user = userEvent.setup();
    render(<Collection />);
    await user.click(screen.getByRole("button", { name: "多选卡片" }));
    const checkbox = screen.getByRole("checkbox", { name: "选择 First" });
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();
    expect(screen.getByText("First").parentElement).toHaveAttribute("inert");
    await user.click(screen.getByRole("button", { name: "删除所选" }));
    expect(remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("list", { name: "待删除内容" })).toHaveTextContent("First");
    await user.click(within(dialog).getByRole("button", { name: "确认删除" }));
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("value", "0");
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    await act(async () => finish({ success: true }));
    await waitFor(() =>
      expect(within(dialog).getByRole("status")).toHaveTextContent("已删除 1 项"),
    );
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("value", "1");
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: "多选卡片" })).toHaveFocus();
  });

  it("renders floating controls when toolbar scrolled offscreen", async () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    class MockIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    function Collection() {
      const selection = useBulkDelete(items, vi.fn());
      return <BulkDeleteActions selection={selection} />;
    }
    const user = userEvent.setup();
    render(<Collection />);

    await user.click(screen.getByRole("button", { name: "多选卡片" }));

    // Trigger offscreen
    act(() => {
      observerCallback?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    const floating = screen.getByRole("group", { name: "浮动多选操作" });
    expect(floating).toBeInTheDocument();
    expect(within(floating).getByRole("button", { name: "全选当前列表" })).toHaveTextContent(
      "全选",
    );
    expect(within(floating).getByRole("button", { name: "删除所选" })).toHaveTextContent("删除");

    // Cancel offscreen
    act(() => {
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(screen.queryByRole("group", { name: "浮动多选操作" })).toBeNull();
    vi.unstubAllGlobals();
  });
});
