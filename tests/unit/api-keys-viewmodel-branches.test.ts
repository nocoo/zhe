// @vitest-environment happy-dom
//
// Failure / cancel branch coverage for useApiKeysViewModel.
//
// The companion file `api-keys-viewmodel.test.ts` exercises the
// happy-path through the real ScopedDB stack. This file mocks
// `@/actions/api-keys` directly so we can drive failure and
// cancellation branches that the action stack will not naturally
// produce (e.g. listApiKeys returning success:false, mid-flight
// unmount, createApiKeyAction throwing).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@/actions/api-keys", () => ({
  listApiKeys: vi.fn(),
  createApiKeyAction: vi.fn(),
  revokeApiKeyAction: vi.fn(),
}));

import { listApiKeys, createApiKeyAction, revokeApiKeyAction } from "@/actions/api-keys";
import { useApiKeysViewModel } from "@/viewmodels/useApiKeysViewModel";

describe("useApiKeysViewModel — failure & cancel branches", () => {
  beforeEach(() => {
    vi.mocked(listApiKeys).mockReset();
    vi.mocked(createApiKeyAction).mockReset();
    vi.mocked(revokeApiKeyAction).mockReset();
  });

  it("leaves keys empty and clears isLoading when initial listApiKeys fails", async () => {
    vi.mocked(listApiKeys).mockResolvedValue({ success: false, error: "Unauthorized" });

    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });

    expect(result.current.keys).toEqual([]);
    expect(result.current.newlyCreatedKey).toBeNull();
  });

  it("does not read the resolved listApiKeys result after unmount (cancelled guard runs)", async () => {
    // Strategy: have listApiKeys resolve to a Proxy. The hook's post-await code
    // reads `result.success` (and on success, `result.data`). If the cancelled
    // guard ran first, neither property is accessed and the trap counter stays
    // at 0. If the guard regressed, accessing `.success` after unmount would
    // increment the counter. This is deterministic and does not rely on
    // result.current snapshots or React's (unreliable in v19) post-unmount
    // setState warnings.
    let resolveList: (v: Awaited<ReturnType<typeof listApiKeys>>) => void = () => {};
    vi.mocked(listApiKeys).mockReturnValue(
      new Promise((resolve) => { resolveList = resolve; }),
    );

    const { unmount } = renderHook(() => useApiKeysViewModel());
    unmount();

    let propertyAccessCount = 0;
    const accessedProps: PropertyKey[] = [];
    const target = {
      success: true as const,
      data: [
        { id: "k1", prefix: "zhe_p", name: "Late", scopes: "links:read", createdAt: new Date(0), lastUsedAt: null },
      ],
    };
    const sentinel = new Proxy(target, {
      get(t, prop, receiver) {
        // Filter out internal Promise/await machinery (e.g. `then`) so we only
        // count reads performed by the hook body itself.
        if (prop === "then" || typeof prop === "symbol") {
          return Reflect.get(t, prop, receiver);
        }
        propertyAccessCount += 1;
        accessedProps.push(prop);
        return Reflect.get(t, prop, receiver);
      },
    });

    await act(async () => {
      resolveList(sentinel as unknown as Awaited<ReturnType<typeof listApiKeys>>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(propertyAccessCount).toBe(0);
    expect(accessedProps).toEqual([]);
  });

  it("DOES read the resolved listApiKeys result when not unmounted (control: guard does not block happy path)", async () => {
    // Companion to the cancelled-branch test: same Proxy instrumentation, but
    // without unmount(). Confirms the trap mechanism actually fires in the
    // un-cancelled case — without this control, a bug that broke result reads
    // entirely would make the cancelled-branch test pass for the wrong reason.
    let resolveList: (v: Awaited<ReturnType<typeof listApiKeys>>) => void = () => {};
    vi.mocked(listApiKeys).mockReturnValue(
      new Promise((resolve) => { resolveList = resolve; }),
    );

    const { result } = renderHook(() => useApiKeysViewModel());

    let propertyAccessCount = 0;
    const target = {
      success: true as const,
      data: [
        { id: "k1", prefix: "zhe_p", name: "Late", scopes: "links:read", createdAt: new Date(0), lastUsedAt: null },
      ],
    };
    const sentinel = new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === "then" || typeof prop === "symbol") {
          return Reflect.get(t, prop, receiver);
        }
        propertyAccessCount += 1;
        return Reflect.get(t, prop, receiver);
      },
    });

    await act(async () => {
      resolveList(sentinel as unknown as Awaited<ReturnType<typeof listApiKeys>>);
      await Promise.resolve();
      await Promise.resolve();
    });

    // At minimum the hook reads `.success`; on success it also reads `.data`.
    expect(propertyAccessCount).toBeGreaterThanOrEqual(1);
    expect(result.current.keys).toHaveLength(1);
  });

  it("returns failure result and resets isCreating when handleCreate fails", async () => {
    vi.mocked(listApiKeys).mockResolvedValue({ success: true, data: [] });
    vi.mocked(createApiKeyAction).mockResolvedValue({
      success: false,
      error: "Name must be 1-64 characters",
    });

    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });

    let createResult: Awaited<ReturnType<typeof result.current.handleCreate>> | undefined;
    await act(async () => {
      createResult = await result.current.handleCreate("", ["links:read"]);
    });

    expect(createResult).toEqual({ success: false, error: "Name must be 1-64 characters" });
    expect(result.current.isCreating).toBe(false);
    expect(result.current.newlyCreatedKey).toBeNull();
    expect(result.current.keys).toEqual([]);
    // Should not have refreshed the list because create failed.
    expect(vi.mocked(listApiKeys)).toHaveBeenCalledTimes(1);
  });

  it("resets isCreating even when createApiKeyAction throws", async () => {
    vi.mocked(listApiKeys).mockResolvedValue({ success: true, data: [] });
    vi.mocked(createApiKeyAction).mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });

    await act(async () => {
      await expect(
        result.current.handleCreate("Name", ["links:read"]),
      ).rejects.toThrow(/network down/);
    });

    expect(result.current.isCreating).toBe(false);
  });

  it("keeps newlyCreatedKey but does not update list when create succeeds and follow-up listApiKeys fails", async () => {
    vi.mocked(listApiKeys).mockResolvedValueOnce({ success: true, data: [] });
    vi.mocked(createApiKeyAction).mockResolvedValue({
      success: true,
      data: {
        id: "k-new",
        prefix: "zhe_new",
        name: "Stale",
        scopes: "links:read",
        createdAt: new Date(0),
        fullKey: "zhe_new_secret",
      },
    });
    vi.mocked(listApiKeys).mockResolvedValueOnce({ success: false, error: "boom" });

    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });

    await act(async () => {
      await result.current.handleCreate("Stale", ["links:read"]);
    });

    expect(result.current.newlyCreatedKey).toBe("zhe_new_secret");
    expect(result.current.keys).toEqual([]);
  });

  it("returns failure result without mutating list when handleRevoke fails", async () => {
    vi.mocked(listApiKeys).mockResolvedValue({
      success: true,
      data: [
        { id: "k1", prefix: "zhe_p", name: "Keep", scopes: "links:read", createdAt: new Date(0), lastUsedAt: null },
      ],
    });
    vi.mocked(revokeApiKeyAction).mockResolvedValue({
      success: false,
      error: "Key not found or already revoked",
    });

    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });
    expect(result.current.keys).toHaveLength(1);

    let revokeResult: Awaited<ReturnType<typeof result.current.handleRevoke>> | undefined;
    await act(async () => {
      revokeResult = await result.current.handleRevoke("k1");
    });

    expect(revokeResult).toEqual({ success: false, error: "Key not found or already revoked" });
    // Key must still be in the list — failed revoke must not optimistically remove.
    expect(result.current.keys).toHaveLength(1);
    expect(result.current.keys[0]?.id).toBe("k1");
  });
});
