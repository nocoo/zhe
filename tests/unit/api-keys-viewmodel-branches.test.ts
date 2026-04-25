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

  it("does not setKeys after unmount even if mount fetch resolves later (cancelled branch)", async () => {
    let resolveList: (v: Awaited<ReturnType<typeof listApiKeys>>) => void = () => {};
    vi.mocked(listApiKeys).mockReturnValue(
      new Promise((resolve) => { resolveList = resolve; }),
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useApiKeysViewModel());

    // Unmount while the fetch is still pending — cancelled flag should flip.
    unmount();

    // Now resolve the fetch with data; the hook must not attempt to setKeys.
    await act(async () => {
      resolveList({
        success: true,
        data: [
          { id: "k1", prefix: "zhe_p", name: "Late", scopes: "links:read", createdAt: new Date(0), lastUsedAt: null },
        ],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // React would log "state update on unmounted component" if cancelled
    // were not honoured. Confirm no such warning was emitted.
    const updateAfterUnmount = errorSpy.mock.calls.some(call =>
      String(call[0] ?? "").includes("unmounted") ||
      String(call[0] ?? "").includes("Can't perform a React state update"),
    );
    expect(updateAfterUnmount).toBe(false);
    expect(result.current.keys).toEqual([]);
    errorSpy.mockRestore();
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
