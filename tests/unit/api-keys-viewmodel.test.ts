// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockStorage } from "../mocks/db-storage";

vi.mock("@/lib/auth-context", () => ({
  getScopedDB: vi.fn(),
}));

import * as apiKeyActions from "@/actions/api-keys";
import { getScopedDB } from "@/lib/auth-context";
import { ScopedDB } from "@/lib/db/scoped";
import { useApiKeysViewModel } from "@/viewmodels/useApiKeysViewModel";

const USER_ID = "user-vm-test";

describe("useApiKeysViewModel", () => {
  beforeEach(() => {
    clearMockStorage();
    vi.mocked(getScopedDB).mockResolvedValue(new ScopedDB(USER_ID));
  });

  it("loads empty keys on mount", async () => {
    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });
    expect(result.current.keys).toEqual([]);
  });

  it("creates a key and shows fullKey once", async () => {
    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });

    let createResult: Awaited<ReturnType<typeof result.current.handleCreate>> | undefined;
    await act(async () => {
      createResult = await result.current.handleCreate("Test", ["links:read"]);
    });

    expect(createResult?.success).toBe(true);
    expect(result.current.newlyCreatedKey).toMatch(/^zhe_/);
    expect(result.current.keys).toHaveLength(1);
    expect(result.current.keys[0]?.expiresAt).toBeNull();
  });

  it("passes an explicitly selected lifetime through to creation and the refreshed list", async () => {
    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });
    await act(async () => {
      await result.current.handleCreate("One Day", ["connector:write"], 1);
    });
    const key = result.current.keys[0];
    expect(key?.expiresAt?.getTime()).toBeGreaterThanOrEqual(
      (key?.createdAt?.getTime() ?? 0) + 86399_000,
    );
    expect(key?.expiresAt?.getTime()).toBeLessThanOrEqual(
      (key?.createdAt?.getTime() ?? 0) + 86400_000,
    );
  });

  it("revokes a key and removes from list", async () => {
    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });

    let createResult: Awaited<ReturnType<typeof result.current.handleCreate>> | undefined;
    await act(async () => {
      createResult = await result.current.handleCreate("Revokable", ["links:read"]);
    });
    expect(result.current.keys).toHaveLength(1);

    await act(async () => {
      if (createResult?.success && createResult.data) {
        await result.current.handleRevoke(createResult.data.id);
      }
    });
    expect(result.current.keys).toHaveLength(0);
  });

  it("clearNewKey clears the newly created key", async () => {
    const { result } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });

    await act(async () => {
      await result.current.handleCreate("Key", ["links:read"]);
    });
    expect(result.current.newlyCreatedKey).not.toBeNull();

    act(() => result.current.clearNewKey());
    expect(result.current.newlyCreatedKey).toBeNull();
  });

  it("handles list/create/revoke failures without corrupting state", async () => {
    const listSpy = vi.spyOn(apiKeyActions, "listApiKeys").mockResolvedValueOnce({
      success: false,
      error: "Unauthorized",
    });
    const { result, unmount } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { interval: 5 });
    expect(result.current.keys).toEqual([]);
    unmount();
    listSpy.mockRestore();

    const { result: vm } = renderHook(() => useApiKeysViewModel());
    await waitFor(() => expect(vm.current.isLoading).toBe(false), { interval: 5 });

    const createSpy = vi
      .spyOn(apiKeyActions, "createApiKeyAction")
      .mockResolvedValueOnce({ success: false, error: "Invalid name" });
    await act(async () => {
      const res = await vm.current.handleCreate("", ["links:read"]);
      expect(res).toEqual({ success: false, error: "Invalid name" });
    });
    expect(vm.current.isCreating).toBe(false);
    expect(vm.current.newlyCreatedKey).toBeNull();

    createSpy.mockResolvedValueOnce({ success: false, error: "" });
    await act(async () => {
      await vm.current.handleCreate("", ["links:read"]);
    });
    createSpy.mockRestore();

    const revokeSpy = vi
      .spyOn(apiKeyActions, "revokeApiKeyAction")
      .mockResolvedValueOnce({ success: false, error: "Not found" })
      .mockResolvedValueOnce({ success: false, error: "" });
    await act(async () => {
      expect(await vm.current.handleRevoke("missing")).toEqual({
        success: false,
        error: "Not found",
      });
      await vm.current.handleRevoke("missing");
    });
    revokeSpy.mockRestore();
  });
});
