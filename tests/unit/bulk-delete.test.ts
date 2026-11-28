// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBulkDelete } from "@/viewmodels/useBulkDelete";

const items = [
  { id: 1, label: "First" },
  { id: 2, label: "Second" },
  { id: 3, label: "Third" },
];

describe("useBulkDelete", () => {
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

  it("waits for each deletion, blocks unload and duplicate execution, and retries only failures", async () => {
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
    expect(result.current.count).toBe(3);
    act(() => result.current.deselect(3));
    expect(result.current.count).toBe(2);
    act(() => result.current.toggle(3));
    expect(result.current.count).toBe(3);

    act(() => result.current.requestDelete());
    let running = Promise.resolve();
    act(() => {
      running = result.current.execute();
    });
    expect(remove).toHaveBeenCalledTimes(1);

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

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

  it("exits selection with Escape, clears choices and leaves dialog Escape to the dialog", () => {
    const { result } = renderHook(() => useBulkDelete(items, vi.fn()));
    act(() => {
      result.current.enter();
      result.current.toggle(1);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.active).toBe(false);
    expect(result.current.count).toBe(0);

    act(() => {
      result.current.enter();
      result.current.toggle(1);
    });
    act(() => result.current.requestDelete());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.active).toBe(true);
    expect(result.current.batch?.phase).toBe("confirm");
  });

  it("preserves selection when Escape belongs to an overlay, composition or another handler", () => {
    const { result } = renderHook(() => useBulkDelete(items, vi.fn()));
    act(() => result.current.enter());
    for (const init of [{ key: "Enter" }, { key: "Escape", isComposing: true }]) {
      act(() => window.dispatchEvent(new KeyboardEvent("keydown", init)));
      expect(result.current.active).toBe(true);
    }
    const handled = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    handled.preventDefault();
    act(() => window.dispatchEvent(handled));
    expect(result.current.active).toBe(true);

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const input = document.createElement("input");
    dialog.appendChild(input);
    document.body.appendChild(dialog);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(result.current.active).toBe(true);
    dialog.remove();
  });
});
