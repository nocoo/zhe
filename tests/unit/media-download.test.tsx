// @vitest-environment happy-dom

import { toast } from "@nocoo/basalt/components/toast";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMediaDownload } from "@/viewmodels/useMediaDownload";

vi.mock("@nocoo/basalt/components/toast", () => ({ toast: { error: vi.fn() } }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([
  ["PHOTO", "image.png", "png"],
  ["VIDEO", "video.mp4", "mp4"],
  ["PHOTO", "asset", "jpg"],
  ["GIF", "asset", "mp4"],
] as const)(
  "downloads %s as a local file and releases its object URL",
  async (type, path, extension) => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("file")));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:media");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe(`x-123.${extension}`);
      expect(this.href).toBe("blob:media");
      expect(this.isConnected).toBe(true);
    });
    const { result } = renderHook(() =>
      useMediaDownload({ id: "123", type, url: `https://s.zhe.to/${path}` }),
    );
    await act(() => result.current.download());
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    expect(result.current.pending).toBe(false);
    act(() => vi.runAllTimers());
    expect(revoke).toHaveBeenCalledWith("blob:media");
  },
);

it.each([false, true])(
  "reports a download error and permits retry (network=%s)",
  async (network) => {
    vi.stubGlobal(
      "fetch",
      network
        ? vi.fn().mockRejectedValue(new Error("Offline"))
        : vi.fn().mockResolvedValue(new Response("Error", { status: 404 })),
    );
    const { result } = renderHook(() =>
      useMediaDownload({ id: "123", type: "VIDEO", url: "/video.mp4" }),
    );
    await act(() => result.current.download());
    expect(toast.error).toHaveBeenCalledWith("下载失败，请稍后重试");
    expect(result.current.pending).toBe(false);
  },
);
