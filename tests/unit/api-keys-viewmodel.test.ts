// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { clearMockStorage } from "../mocks/db-storage";

vi.mock("@/lib/auth-context", () => ({
  getScopedDB: vi.fn(),
}));

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
});