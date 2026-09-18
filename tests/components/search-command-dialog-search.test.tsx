// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSearch } from "@/viewmodels/useSearch";

const fetcher = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("debounces, normalizes, and never downloads full dashboard arrays", async () => {
  fetcher.mockResolvedValue(Response.json({ items: [], total: 0 }));
  const { result, rerender } = renderHook(({ q }) => useSearch(q), { initialProps: { q: " " } });
  expect(result.current.loading).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  rerender({ q: "  CAFÉ\n中文 %_  " });
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.data?.total).toBe(0));
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toMatchObject({
    query: "café 中文 %_",
    limit: 20,
  });
});
it("cancels superseded requests and rejects late results even if fetch ignores abort", async () => {
  let oldResolve: (value: Response) => void = () => {};
  fetcher
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldResolve = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json({ items: [], total: 2 }));
  const { result, rerender } = renderHook(({ q }) => useSearch(q), { initialProps: { q: "old" } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  rerender({ q: "new" });
  expect(fetcher.mock.calls[0]?.[1].signal.aborted).toBe(true);
  await waitFor(() => expect(result.current.data?.total).toBe(2));
  await act(async () => oldResolve(Response.json({ items: [], total: 99 })));
  expect(result.current.data?.total).toBe(2);
});
it("exposes errors, retries, and clears private results when disabled", async () => {
  fetcher
    .mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ total: 1, items: [] }));
  const { result, rerender } = renderHook(({ enabled }) => useSearch("x", "github", 20, enabled), {
    initialProps: { enabled: true },
  });
  await waitFor(() => expect(result.current.error).toBe("unavailable"));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.data?.total).toBe(1));
  rerender({ enabled: false });
  expect(result.current.data).toBeUndefined();
  expect(result.current.loading).toBe(false);
});
it("times out and permits retry", async () => {
  vi.useFakeTimers();
  fetcher.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  );
  const { result } = renderHook(() => useSearch("timeout"));
  await act(async () => vi.advanceTimersByTimeAsync(20_181));
  expect(result.current.error).toContain("超时");
  vi.useRealTimers();
});

it("continues index preparation without presenting an error or stale results", async () => {
  vi.useFakeTimers();
  try {
    fetcher
      .mockResolvedValueOnce(Response.json({ code: "index_updating" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ items: [], total: 0 }));
    const { result } = renderHook(() => useSearch("pending"));
    await act(async () => vi.advanceTimersByTimeAsync(181));
    expect(result.current.loading).toBe(true);
    expect(result.current.message).toContain("更新搜索索引");
    expect(result.current.error).toBeUndefined();
    await act(async () => vi.advanceTimersByTimeAsync(1001));
    await act(async () => vi.advanceTimersByTimeAsync(181));
    expect(result.current.data?.total).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
