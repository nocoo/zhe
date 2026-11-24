// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREFERENCE_KEY } from "@/scripts/lib/environment-mode";
import { useEnvironmentViewModel } from "@/viewmodels/useEnvironmentViewModel";

describe("useEnvironmentViewModel", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete window.__ZHE_LOCAL__;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete window.__ZHE_LOCAL__;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads local descriptor from window.__ZHE_LOCAL__ on mount", () => {
    window.__ZHE_LOCAL__ = { id: "inst-1", mode: "demo", intent: "interactive" };
    const { result } = renderHook(() => useEnvironmentViewModel());

    expect(result.current.local).toEqual({
      id: "inst-1",
      mode: "demo",
      intent: "interactive",
    });
    expect(result.current.pendingMode).toBeUndefined();
    expect(result.current.error).toBe("");
  });

  it("ignores invalid, unchanged, missing-local, or automation-mode selections", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const missingLocal = renderHook(() => useEnvironmentViewModel());
    await act(async () => {
      await missingLocal.result.current.select("prod");
    });

    window.__ZHE_LOCAL__ = { id: "inst-1", mode: "demo", intent: "interactive" };
    const interactive = renderHook(() => useEnvironmentViewModel());
    await act(async () => {
      await interactive.result.current.select("staging");
      await interactive.result.current.select("demo");
    });

    window.__ZHE_LOCAL__ = { id: "inst-2", mode: "demo", intent: "automation" };
    const automation = renderHook(() => useEnvironmentViewModel());
    await act(async () => {
      await automation.result.current.select("prod");
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores concurrent select calls while a switch is already pending", async () => {
    window.__ZHE_LOCAL__ = { id: "inst-1", mode: "demo", intent: "interactive" };
    let resolveFetch!: (value: Response) => void;
    const fetchSpy = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const replaceSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, replace: replaceSpy },
    });

    const { result } = renderHook(() => useEnvironmentViewModel());

    let firstPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.select("prod");
    });
    expect(result.current.pendingMode).toBe("prod");

    await act(async () => {
      await result.current.select("e2e");
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ mode: "prod" }), { status: 200 }));
      await firstPromise;
    });
    expect(replaceSpy).toHaveBeenCalledWith("/");
  });

  it("prompts on dirty input or cancelled beforeunload and aborts when declined", async () => {
    window.__ZHE_LOCAL__ = { id: "inst-1", mode: "demo", intent: "interactive" };
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ mode: "prod" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const confirmSpy = vi.fn().mockReturnValue(false);
    Object.defineProperty(window, "confirm", {
      configurable: true,
      writable: true,
      value: confirmSpy,
    });
    const replaceSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, replace: replaceSpy },
    });

    const { result, unmount } = renderHook(() => useEnvironmentViewModel());

    document.dispatchEvent(new Event("input"));
    await act(async () => {
      await result.current.select("prod");
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await act(async () => {
      await result.current.select("prod");
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    unmount();

    const preventUnload = (event: Event) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventUnload);
    try {
      confirmSpy.mockReturnValue(false);
      const second = renderHook(() => useEnvironmentViewModel());
      await act(async () => {
        await second.result.current.select("e2e");
      });
      expect(confirmSpy).toHaveBeenCalledTimes(3);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("beforeunload", preventUnload);
    }
  });

  it("persists preference and redirects on success even if localStorage throws", async () => {
    window.__ZHE_LOCAL__ = { id: "inst-1", mode: "demo", intent: "interactive" };
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ mode: "prod" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const setItemSpy = vi.spyOn(localStorage, "setItem");
    const replaceSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, replace: replaceSpy },
    });

    const { result } = renderHook(() => useEnvironmentViewModel());
    await act(async () => {
      await result.current.select("prod");
    });

    expect(fetchSpy).toHaveBeenCalledWith("/_local/select", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-zhe-instance": "inst-1" },
      body: JSON.stringify({ mode: "prod" }),
    });
    expect(setItemSpy).toHaveBeenCalledWith(PREFERENCE_KEY, "prod");
    expect(replaceSpy).toHaveBeenCalledWith("/");

    setItemSpy.mockImplementation(() => {
      throw new Error("storage quota exceeded");
    });
    const second = renderHook(() => useEnvironmentViewModel());
    await act(async () => {
      await second.result.current.select("e2e");
    });
    expect(replaceSpy).toHaveBeenCalledTimes(2);
  });

  it("reports HTTP error text and fallback message on non-Error throws", async () => {
    window.__ZHE_LOCAL__ = { id: "inst-1", mode: "demo", intent: "interactive" };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("Switch blocked", { status: 403 }))
      .mockRejectedValueOnce("unexpected-string-error");
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useEnvironmentViewModel());

    await act(async () => {
      await result.current.select("prod");
    });
    expect(result.current.error).toBe("Switch blocked");
    expect(result.current.pendingMode).toBeUndefined();

    await act(async () => {
      await result.current.select("e2e");
    });
    expect(result.current.error).toBe("Environment switch failed");
    expect(result.current.pendingMode).toBeUndefined();
  });
});
