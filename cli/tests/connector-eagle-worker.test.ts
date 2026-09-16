import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { downloadMedia } from "../src/connector/download.js";
import type { EagleTask } from "../src/connector/eagle.js";
import { prepareEagle } from "../src/connector/eagle-worker.js";

vi.mock("../src/connector/download.js", () => ({ downloadMedia: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
let directory: string;
let original: string;
const bytes = Buffer.from(`89504e470d0a1a0a${"00".repeat(24)}`, "hex");
const task = {
  media: { id: "123", type: "PHOTO", url: "https://pbs.twimg.com/media/test.png" },
} as EagleTask;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "zhe-eagle-worker-"));
  original = join(directory, "download");
  await writeFile(original, bytes);
  vi.mocked(downloadMedia).mockResolvedValue({
    path: original,
    mime: "image/png",
    size: bytes.length,
    sha256: "a".repeat(64),
    width: 1200,
    height: 800,
  });
  vi.mocked(execFile).mockImplementation(((
    _cmd: unknown,
    args: string[],
    _options: unknown,
    done: (error: null, result: string) => void,
  ) => {
    void writeFile(args.at(-1) as string, bytes).then(() => done(null, ""));
  }) as any);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

it("prepares original, bounded PNG thumbnail and independently hashed manifest", async () => {
  await prepareEagle(task, directory);
  expect(await readFile(join(directory, "original.png"))).toEqual(bytes);
  expect(JSON.parse(await readFile(join(directory, "prepared.json"), "utf8"))).toMatchObject({
    ext: "png",
    width: 1200,
    height: 800,
    thumbnailSha256: createHash("sha256").update(bytes).digest("hex"),
  });
  expect(execFile).toHaveBeenCalledWith(
    "ffmpeg",
    expect.arrayContaining([
      "-frames:v",
      "1",
      "scale=640:640:force_original_aspect_ratio=decrease",
    ]),
    expect.objectContaining({ timeout: 30_000 }),
    expect.any(Function),
  );
});
it.each([
  { mime: "video/mp4" },
  { width: undefined },
  { height: undefined },
  { width: 100001, height: 100001 },
])("rejects invalid image shape: %j", async (invalid) => {
  vi.mocked(downloadMedia).mockResolvedValue({
    path: original,
    mime: "image/png",
    size: bytes.length,
    sha256: "a".repeat(64),
    width: 1200,
    height: 800,
    ...invalid,
  });
  await expect(prepareEagle(task, directory)).rejects.toThrow("invalid_media");
});
it.each([Buffer.alloc(2), Buffer.alloc(25), Buffer.alloc(10 * 1024 * 1024 + 1)])(
  "rejects truncated, incorrect and oversized thumbnails",
  async (thumbnail) => {
    vi.mocked(execFile).mockImplementation(((
      _cmd: unknown,
      args: string[],
      _options: unknown,
      done: (error: null, result: string) => void,
    ) => {
      void writeFile(args.at(-1) as string, thumbnail).then(() => done(null, ""));
    }) as any);
    await expect(prepareEagle(task, directory)).rejects.toThrow("invalid_thumbnail");
  },
);
