// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadScreenshotPreviews } from "@/actions/connector";
import { useScreenshotPreviews } from "@/viewmodels/useScreenshotPreviews";
import { makeLink } from "../fixtures";

vi.mock("@/actions/connector", () => ({ loadScreenshotPreviews: vi.fn() }));
const link = makeLink({ id: 1, originalUrl: "https://example.com/article", screenshotUrl: null });
const preview = {
  id: 1,
  originalUrl: link.originalUrl,
  screenshotUrl: "https://cdn.example.com/preview.webp",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.mocked(loadScreenshotPreviews).mockResolvedValue({ success: true, data: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("completed screenshot updates", () => {
  it("polls missing ordinary previews in batches, then stops when filled", async () => {
    const update = vi.fn();
    const links = Array.from({ length: 81 }, (_, id) =>
      makeLink({ id: id + 1, originalUrl: `https://example.com/${id}` }),
    );
    links.push(
      makeLink({ id: 82, originalUrl: "https://x.com/person" }),
      makeLink({ id: 83, originalUrl: "https://github.com/person" }),
    );
    const { rerender } = renderHook(({ links }) => useScreenshotPreviews(links, update), {
      initialProps: { links },
    });
    await act(async () => {});
    expect(vi.mocked(loadScreenshotPreviews).mock.calls.map(([ids]) => ids.length)).toEqual([
      80, 1,
    ]);
    rerender({ links: [makeLink({ ...link, screenshotUrl: preview.screenshotUrl })] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(loadScreenshotPreviews).toHaveBeenCalledTimes(2);
  });

  it("keeps current metadata when the preview arrives", async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof loadScreenshotPreviews>>>();
    vi.mocked(loadScreenshotPreviews).mockReturnValueOnce(pending.promise);
    const update = vi.fn();
    const { rerender } = renderHook(({ links }) => useScreenshotPreviews(links, update), {
      initialProps: { links: [link] },
    });
    rerender({ links: [{ ...link, note: "new note", metaTitle: "edited title" }] });
    await act(async () => {
      pending.resolve({ success: true, data: [preview] });
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        note: "new note",
        metaTitle: "edited title",
        screenshotUrl: preview.screenshotUrl,
      }),
    );
  });

  it.each(["url", "manual", "delete"])(
    "does not overwrite a %s change during polling",
    async (change) => {
      const pending = Promise.withResolvers<Awaited<ReturnType<typeof loadScreenshotPreviews>>>();
      vi.mocked(loadScreenshotPreviews).mockReturnValueOnce(pending.promise);
      const update = vi.fn();
      const { rerender } = renderHook(({ links }) => useScreenshotPreviews(links, update), {
        initialProps: { links: [link] },
      });
      rerender({
        links:
          change === "delete"
            ? []
            : [
                {
                  ...link,
                  ...(change === "url"
                    ? { originalUrl: "https://example.com/new" }
                    : { screenshotUrl: "manual" }),
                },
              ],
      });
      await act(async () => {
        pending.resolve({ success: true, data: [preview] });
      });
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("pauses in the background and retries failed reads without overlapping requests", async () => {
    const update = vi.fn();
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof loadScreenshotPreviews>>>();
    vi.mocked(loadScreenshotPreviews).mockReturnValueOnce(pending.promise);
    renderHook(() => useScreenshotPreviews([link], update));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(loadScreenshotPreviews).toHaveBeenCalledOnce();
    await act(async () => {
      pending.resolve({ success: false });
    });
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(loadScreenshotPreviews).toHaveBeenCalledOnce();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    vi.mocked(loadScreenshotPreviews).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    vi.mocked(loadScreenshotPreviews).mockResolvedValueOnce({ success: true, data: [preview] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(loadScreenshotPreviews).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledWith({ ...link, screenshotUrl: preview.screenshotUrl });
  });
});
