import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  MAX_VIDEO_BYTES,
  videoFileSize,
  videoResolution,
  type XMedia,
} from "../src/connector/core.js";
import { downloadVideo, videoCandidates } from "../src/connector/video.js";

const execute = vi.hoisted(() => vi.fn());
vi.mock("node:util", async (original) => ({
  ...(await original<typeof import("node:util")>()),
  promisify: () => execute,
}));
const id = "2000000000000000002";
const variant = (width: number, height: number, bitrate = 1) => ({
  url: `https://video.twimg.com/ext_tw_video/${id}/pu/vid/${width}x${height}/test.mp4`,
  width,
  height,
  bitrate,
});
const variants = [variant(3840, 2160), variant(1920, 1080), variant(1280, 720), variant(640, 360)];
const media: XMedia = { id, type: "VIDEO", ...variants[0], variants };
const bytes = new Uint8Array(64);
bytes.set([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
let dir: string;
let fetched: string[];
let canceled: string[];
function responses(sizes: number[], status = 200, mime = "video/mp4") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("dns-query"))
        return Response.json({ Status: 0, Answer: [{ type: 1, data: "104.244.42.1" }] });
      const size = sizes[fetched.length] ?? 64;
      fetched.push(url);
      const dimensions = /\/(\d+)x(\d+)\//.exec(url);
      execute.mockResolvedValue({
        stdout: JSON.stringify({
          format: { duration: "361.17" },
          streams: [
            {
              codec_type: "video",
              width: Number(dimensions?.[1]),
              height: Number(dimensions?.[2]),
            },
          ],
        }),
      });
      return new Response(
        new ReadableStream({
          start(controller) {
            if (size <= MAX_VIDEO_BYTES) {
              controller.enqueue(bytes);
              controller.close();
            }
          },
          cancel() {
            canceled.push(url);
          },
        }),
        { status, headers: { "content-type": mime, "content-length": String(size) } },
      );
    }),
  );
}
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "zhe-video-"));
  fetched = [];
  canceled = [];
  execute.mockReset();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});
it.each([
  { sizes: [64], selected: 0 },
  { sizes: [564200241, 64], selected: 1 },
  { sizes: [564200241, 120845059, 64], selected: 2 },
])(
  "selects first version under 100 MB and cancels oversized bodies: $selected",
  async ({ sizes, selected }) => {
    responses(sizes);
    const report = vi.fn();
    const progress = vi.fn();
    const file = await downloadVideo(media, dir, undefined, progress, report);
    expect(fetched).toEqual(variants.slice(0, selected + 1).map((v) => v.url));
    expect(canceled).toEqual(fetched.slice(0, -1));
    expect(file).toMatchObject({
      sourceUrl: variants[selected]?.url,
      size: 64,
      width: variants[selected]?.width,
      height: variants[selected]?.height,
    });
    expect(file.videoAttempts?.map((a) => a.size)).toEqual(sizes);
    expect(await readFile(file.path)).toEqual(Buffer.from(bytes));
    expect(execute.mock.calls.map((c) => c[0])).toEqual(["ffprobe", "ffmpeg"]);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Selected") }),
    );
    expect(progress).toHaveBeenCalledWith("verify", 64, 64);
  },
);
it("fails with all checked sizes and never falls back to 360p", async () => {
  responses([564200241, 120845059, 100000001]);
  await expect(downloadVideo(media, dir)).rejects.toMatchObject({
    code: "media_too_large",
    attempts: variants.slice(0, 3).map((v, i) => ({
      width: v.width,
      height: v.height,
      size: [564200241, 120845059, 100000001][i],
    })),
  });
  expect(fetched).toEqual(canceled);
  expect(fetched).toHaveLength(3);
  expect(await readdir(dir)).toEqual([]);
  expect(execute).not.toHaveBeenCalled();
});
it.each([
  { status: 403, mime: "video/mp4", code: "media_http_error" },
  { status: 200, mime: "text/html", code: "unsupported_media_type" },
])("does not downgrade non-size failures: $code", async ({ status, mime, code }) => {
  responses([64], status, mime);
  await expect(downloadVideo(media, dir)).rejects.toMatchObject({ code, attempts: [] });
  expect(fetched).toHaveLength(1);
});
it("retains size diagnostics for incomplete downloads", async () => {
  responses([65]);
  await expect(downloadVideo(media, dir)).rejects.toMatchObject({
    code: "size_mismatch",
    attempts: [{ width: 3840, height: 2160, size: 65 }],
  });
  expect(fetched).toHaveLength(1);
});
it("does not retry cancellation", async () => {
  responses([64]);
  const controller = new AbortController();
  controller.abort();
  await expect(downloadVideo(media, dir, controller.signal)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("fails closed without a safe source", async () => {
  await expect(
    downloadVideo({ ...media, variants: [], url: "https://attacker.invalid/test.mp4" }, dir),
  ).rejects.toMatchObject({ code: "video_variant_unavailable" });
});
it("uses source availability, portrait resolution, highest bitrate, and no duplicate attempts", () => {
  expect(videoCandidates({ ...media, variants: variants.slice(1) })).toEqual(variants.slice(1, 3));
  const portrait = [variant(2160, 3840), variant(1080, 1920), variant(720, 1280)];
  expect(videoCandidates({ ...media, variants: portrait })).toEqual(portrait);
  expect(videoCandidates({ ...media, variants: undefined, url: variant(640, 360).url })).toEqual([
    { ...variants[3], bitrate: 0 },
  ]);
  expect(
    videoCandidates({ ...media, variants: [variant(1920, 1080, 2), ...variants] })[1]?.bitrate,
  ).toBe(2);
  expect(videoResolution(2160, 3840)).toBe("4K");
  expect(videoResolution(1280, 720)).toBe("720p");
  expect(videoFileSize(32088091)).toBe("32.1 MB");
});

it("accepts the exact 100 MB header but rejects a truncated body without downgrading", async () => {
  responses([100_000_000]);
  await expect(downloadVideo(media, dir)).rejects.toMatchObject({ code: "size_mismatch" });
  expect(fetched).toHaveLength(1);
});
it("rejects missing file size rather than downloading an unbounded response", async () => {
  responses([Number.NaN]);
  await expect(downloadVideo(media, dir)).rejects.toMatchObject({ code: "invalid_media_length" });
  expect(execute).not.toHaveBeenCalled();
});
