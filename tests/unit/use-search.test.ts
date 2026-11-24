// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "@/models/search";
import { useSearch } from "@/viewmodels/useSearch";

const EMPTY_COUNTS = { web: 0, x: 0, github: 0, idea: 0, todo: 0 };

function makeResponse(query: string): SearchResponse {
  return {
    query,
    items: [],
    total: 0,
    counts: EMPTY_COUNTS,
    offset: 0,
    limit: 20,
  };
}

describe("useSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stays idle when query is blank or search is disabled", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const blank = renderHook(() => useSearch("   \n\t  "));
    expect(blank.result.current.loading).toBe(false);
    expect(blank.result.current.data).toBeUndefined();
    expect(blank.result.current.error).toBeUndefined();

    const disabled = renderHook(() => useSearch("alpha", "web", 0, false));
    expect(disabled.result.current.loading).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("debounces normalized query and resolves search results", async () => {
    const payload = makeResponse("alpha");
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useSearch("  Alpha ", "web", 20, true));

    expect(result.current.loading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(179);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/search",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({ query: "alpha", source: "web", offset: 20, limit: 20 }),
      }),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(payload);
    expect(result.current.error).toBeUndefined();
  });

  it("shows indexing message on 503 index_updating and retries after 1s", async () => {
    const payload = makeResponse("alpha");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "index_updating" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useSearch("alpha"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.message).toBe("正在更新搜索索引…");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(payload);
    expect(result.current.message).toBeUndefined();
  });

  it("surfaces server error and supports manual retry", async () => {
    const payload = makeResponse("alpha");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "搜索服务维护中" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useSearch("alpha"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("搜索服务维护中");

    act(() => {
      result.current.retry();
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(result.current.error).toBeUndefined();
    expect(result.current.data).toEqual(payload);
  });

  it("uses default message when error payload has no message or rejection is non-Error", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce("network-string-failure");
    vi.stubGlobal("fetch", fetchSpy);

    const { result, rerender } = renderHook(({ q }) => useSearch(q), {
      initialProps: { q: "first" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(result.current.error).toBe("暂时无法搜索，请重试");

    rerender({ q: "second" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(result.current.error).toBe("暂时无法搜索，请重试");
  });

  it("reports timeout error when request exceeds 20 seconds", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useSearch("slow"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("搜索超时，请重试");
  });

  it("aborts in-flight fetch and ignores late settlements on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch!: (value: Response) => void;
    let rejectFetch!: (reason: unknown) => void;

    const firstFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });
    vi.stubGlobal("fetch", firstFetch);

    const first = renderHook(() => useSearch("alpha"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    first.unmount();
    expect(capturedSignal?.aborted).toBe(true);
    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify(makeResponse("alpha")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await Promise.resolve();
    });

    const secondFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", secondFetch);
    const second = renderHook(() => useSearch("beta"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    second.unmount();
    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ code: "index_updating" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await Promise.resolve();
    });

    const thirdFetch = vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectFetch = reject;
        }),
    );
    vi.stubGlobal("fetch", thirdFetch);
    const third = renderHook(() => useSearch("gamma"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    third.unmount();
    await act(async () => {
      rejectFetch(new Error("late failure"));
      await Promise.resolve();
    });
  });
});
