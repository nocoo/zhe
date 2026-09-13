import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicAddress } from "../src/connector/dns.js";
import { downloadMedia, makePoster } from "../src/connector/download.js";

const execute = vi.hoisted(() => vi.fn());
vi.mock("node:util", async (original) => ({
  ...(await original<typeof import("node:util")>()),
  promisify: () => execute,
}));
let dir: string;
const media = {
  id: "2000000000000000002",
  type: "VIDEO" as const,
  url: "https://video.twimg.com/ext_tw_video/2000000000000000002/pu/vid/1280x720/test.mp4",
};
const bytes = new Uint8Array(64);
bytes.set([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "zhe-download-test-"));
  execute.mockReset().mockResolvedValue({
    stdout: JSON.stringify({
      format: { duration: "7.2" },
      streams: [{ codec_type: "video", width: 1280, height: 720, codec_name: "h264" }],
    }),
    stderr: "",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("https://cloudflare-dns.com/")
        ? Response.json({ Status: 0, Answer: [{ type: 1, data: "104.244.42.1" }] })
        : new Response(bytes, { headers: { "content-type": "video/mp4", "content-length": "64" } }),
    ),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe("bounded local media capture", () => {
  it("checks public DNS, signature, length, hash and full decode before uploading", async () => {
    const file = await downloadMedia(media, dir);
    expect(file).toMatchObject({
      size: 64,
      mime: "video/mp4",
      width: 1280,
      height: 720,
      duration: 7.2,
    });
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(execute.mock.calls.map((c) => c[0])).toEqual(["ffprobe", "ffmpeg"]);
    expect(await readdir(dir)).toHaveLength(1);
  });
  it("treats photos as archives too", async () => {
    const photo = {
      ...media,
      type: "PHOTO" as const,
      url: "https://pbs.twimg.com/media/synthetic.jpg",
    };
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes("dns-query")
        ? Response.json({ Status: 0, Answer: [{ type: 1, data: "104.244.42.1" }] })
        : new Response(new Uint8Array([255, 216, 255]), {
            headers: { "content-type": "image/jpeg", "content-length": "3" },
          }),
    );
    expect((await downloadMedia(photo, dir)).mime).toBe("image/jpeg");
  });
  it.each([
    { width: 0, height: 720 },
    { width: 1280, height: -1 },
  ])("rejects unusable video dimensions: %j", async (dimensions) => {
    execute.mockResolvedValue({
      stdout: JSON.stringify({
        format: { duration: "7.2" },
        streams: [{ codec_type: "video", codec_name: "h264", ...dimensions }],
      }),
      stderr: "",
    });
    await expect(downloadMedia(media, dir)).rejects.toThrow();
    expect(await readdir(dir)).toHaveLength(0);
  });
  it.each(["private DNS", "redirect", "size", "mime", "decode"])(
    "does not retain failed capture: %s",
    async (problem) => {
      if (problem === "private DNS")
        vi.mocked(fetch).mockResolvedValue(
          Response.json({ Status: 0, Answer: [{ type: 1, data: "127.0.0.1" }] }),
        );
      if (problem === "redirect")
        vi.mocked(fetch).mockImplementation(async (url) =>
          String(url).includes("dns-query")
            ? Response.json({ Status: 0, Answer: [{ type: 1, data: "104.244.42.1" }] })
            : new Response(null, {
                status: 302,
                headers: { location: "http://127.0.0.1/private" },
              }),
        );
      if (problem === "size" || problem === "mime")
        vi.mocked(fetch).mockImplementation(async (url) =>
          String(url).includes("dns-query")
            ? Response.json({ Status: 0, Answer: [{ type: 1, data: "104.244.42.1" }] })
            : new Response(bytes, {
                headers: {
                  "content-type": problem === "mime" ? "text/html" : "video/mp4",
                  "content-length": "65",
                },
              }),
        );
      if (problem === "decode") execute.mockRejectedValue(new Error("decoder failed"));
      await expect(downloadMedia(media, dir)).rejects.toThrow();
      expect(await readdir(dir)).toHaveLength(0);
    },
  );
  it("rejects an unrelated source before any network request", async () => {
    await expect(
      downloadMedia({ ...media, url: "https://attacker.invalid/a.mp4" }, dir),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns no poster on a decoder error", async () => {
    execute.mockRejectedValue(new Error("decode failed"));
    expect(await makePoster(join(dir, "missing.mp4"))).toBeNull();
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.1.1",
    "100.64.0.1",
    "203.0.113.1",
    "198.51.100.1",
    "::1",
    "fc00::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ])("rejects non-public address %s", (address) => expect(isPublicAddress(address)).toBe(false));
});
