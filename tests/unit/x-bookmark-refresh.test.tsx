// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadXBookmarks } from "@/actions/connector";
import { normalizeXPost } from "@/cli/src/connector/core";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Link } from "@/models/types";
import { useXBookmarks } from "@/viewmodels/useXBookmarks";

vi.mock("@/actions/connector", () => ({ loadXBookmarks: vi.fn() }));
const link: Link = {
  id: 1,
  userId: "owner",
  originalUrl: "https://x.com/example/status/12345",
  slug: "test",
  isCustom: false,
  clicks: 0,
  createdAt: new Date(),
  expiresAt: null,
  folderId: null,
  note: null,
  screenshotUrl: null,
  metaTitle: null,
  metaDescription: null,
  metaFavicon: null,
};
const tweet = normalizeXPost(
  {
    rest_id: "12345",
    legacy: { full_text: "Ready after the poll", created_at: "2026-09-12T00:00:00Z" },
    core: { user_results: { result: { legacy: { screen_name: "example", name: "Example" } } } },
  },
  "12345",
)?.tweet;
if (!tweet) throw new Error("Invalid synthetic tweet");
const bookmark: XBookmark = { linkId: 1, state: "complete", tweet, errorCode: null, updatedAt: 1 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(loadXBookmarks).mockResolvedValue({ success: true, data: [bookmark] });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
afterEach(() => vi.useRealTimers());

describe("automatic X card refresh", () => {
  it("batches only X links, refreshes completed content, and updates searchable metadata", async () => {
    const update = vi.fn();
    const { result } = renderHook(() =>
      useXBookmarks([link, { ...link, id: 2, originalUrl: "https://example.com" }], update),
    );
    await act(async () => {});
    expect(loadXBookmarks).toHaveBeenCalledWith([1]);
    expect(result.current.get(1)?.tweet?.text).toBe("Ready after the poll");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, metaDescription: "Ready after the poll" }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(loadXBookmarks).toHaveBeenCalledTimes(2);
  });
  it("ignores late responses after unmount and does not resurrect deleted cards", async () => {
    let finish: (value: { success: boolean; data: XBookmark[] }) => void = () => {};
    vi.mocked(loadXBookmarks).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const update = vi.fn();
    const { unmount } = renderHook(() => useXBookmarks([link], update));
    unmount();
    await act(async () => {
      finish({ success: true, data: [bookmark] });
    });
    expect(update).not.toHaveBeenCalled();
  });
  it("does not overwrite a link whose URL changed while enrichment was in flight", async () => {
    const update = vi.fn();
    const { result } = renderHook(() =>
      useXBookmarks([{ ...link, originalUrl: "https://x.com/example/status/999" }], update),
    );
    await act(async () => {});
    expect(update).not.toHaveBeenCalled();
    expect(result.current.has(1)).toBe(false);
  });
  it("pauses while hidden and resumes when the page becomes visible", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const update = vi.fn();
    const { unmount } = renderHook(() => useXBookmarks([link], update));
    await act(async () => {});
    expect(loadXBookmarks).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(loadXBookmarks).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(loadXBookmarks).toHaveBeenCalledOnce();
  });
});
