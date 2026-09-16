// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadGitHubBookmarks } from "@/actions/github-connector";
import type { GitHubBookmark } from "@/lib/connector/github-jobs";
import { useGitHubBookmarks } from "@/viewmodels/useGitHubBookmarks";
import { makeLink } from "../fixtures";

vi.mock("@/actions/github-connector", () => ({ loadGitHubBookmarks: vi.fn() }));
const link = makeLink({ id: 1, originalUrl: "https://github.com/octocat/hello" });
const repository = {
  sourceFullName: "octocat/hello",
  fullName: "octocat/hello",
  description: "Repository description",
  stars: 1234,
  commits: 76,
  forks: 5,
  language: "TypeScript",
  defaultBranch: "main",
  pushedAt: null,
  archived: false,
  license: "MIT",
  topics: [],
  readmePath: "README.md",
};
const bookmark: GitHubBookmark = {
  linkId: 1,
  sourceUrl: link.originalUrl,
  state: "complete",
  repository,
  hasReadme: true,
  capturedAt: 1789171200000,
  updatedAt: 1,
  errorCode: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.mocked(loadGitHubBookmarks).mockResolvedValue({ success: true, data: [bookmark] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GitHub summary polling", () => {
  it("refreshes and syncs metadata, skips hidden pages, and retains good snapshots on failure", async () => {
    vi.useFakeTimers();
    const update = vi.fn();
    const { result } = renderHook(() => useGitHubBookmarks([link], update));
    await act(async () => {});
    expect(result.current.bookmarks.get(1)).toEqual(bookmark);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ metaTitle: repository.fullName }),
    );
    vi.mocked(loadGitHubBookmarks).mockResolvedValueOnce({ success: false });
    await act(async () => result.current.refresh());
    expect(result.current.bookmarks.get(1)).toEqual(bookmark);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(loadGitHubBookmarks).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(loadGitHubBookmarks).toHaveBeenCalledTimes(3);
    vi.mocked(loadGitHubBookmarks).mockRejectedValueOnce(new Error("offline"));
    await act(async () => result.current.refresh());
    expect(result.current.bookmarks.get(1)).toEqual(bookmark);
  });
  it("batches only repository links and rejects stale source URLs", async () => {
    const update = vi.fn();
    const many = Array.from({ length: 81 }, (_, index) =>
      makeLink({ id: index + 1, originalUrl: `https://github.com/test/repo-${index}` }),
    );
    vi.mocked(loadGitHubBookmarks).mockResolvedValue({ success: true, data: [bookmark] });
    const { result, rerender } = renderHook(({ links }) => useGitHubBookmarks(links, update), {
      initialProps: { links: many },
    });
    await act(async () => {});
    expect(loadGitHubBookmarks).toHaveBeenCalledTimes(2);
    expect(vi.mocked(loadGitHubBookmarks).mock.calls[0]?.[0]).toHaveLength(80);
    expect(result.current.bookmarks.size).toBe(0);
    rerender({ links: [] });
    await act(async () => {});
    expect(result.current.bookmarks.size).toBe(0);
  });
});
