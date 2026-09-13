import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ConnectorError,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  mediaUrl,
  record,
  verifySignature,
  type XMedia,
} from "./core.js";
import { assertPublicMediaDns } from "./dns.js";
import type { DownloadedMedia } from "./types.js";

const execute = promisify(execFile);

async function mediaResponse(media: XMedia, signal: AbortSignal) {
  const video = media.type !== "PHOTO";
  const kind = video ? "video" : "photo";
  const initialUrl = mediaUrl(media.url, media.id, kind);
  if (!initialUrl) throw new ConnectorError("invalid_media");
  let url = initialUrl;
  for (let redirects = 0; redirects <= 2; redirects++) {
    await assertPublicMediaDns(new URL(url).hostname, signal);
    const response = await fetch(url, { redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      const next = location ? mediaUrl(new URL(location, url).href, media.id, kind) : null;
      if (!next || redirects === 2) throw new ConnectorError("unsafe_redirect");
      url = next;
      continue;
    }
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const declared = response.headers.get("content-length") ?? "";
    const size = Number(declared);
    if (
      response.status !== 200 ||
      !response.body ||
      !/^\d+$/.test(declared) ||
      !Number.isSafeInteger(size) ||
      size < (video ? 24 : 3) ||
      size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES) ||
      !(video ? ["video/mp4"] : ["image/jpeg", "image/png", "image/webp"]).includes(mime)
    ) {
      await response.body?.cancel();
      throw new ConnectorError("invalid_media");
    }
    return { body: response.body, size, mime };
  }
  throw new ConnectorError("unsafe_redirect");
}

export async function downloadMedia(
  media: XMedia,
  directory: string,
  signal?: AbortSignal,
): Promise<DownloadedMedia> {
  const video = media.type !== "PHOTO";
  const bounded = AbortSignal.any([AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, randomUUID());
  const partial = `${path}.partial`;
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const { body, size, mime } = await mediaResponse(media, bounded);
    file = await open(partial, "wx", 0o600);
    const reader = body.getReader();
    const hash = createHash("sha256");
    let received = 0;
    let head = new Uint8Array();
    try {
      for (;;) {
        bounded.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > size) throw new ConnectorError("size_mismatch");
        if (head.length < 32) {
          const next = new Uint8Array(Math.min(32, head.length + value.length));
          next.set(head);
          next.set(value.subarray(0, next.length - head.length), head.length);
          head = next;
        }
        hash.update(value);
        await file.writeFile(value);
      }
      if (received !== size) throw new ConnectorError("size_mismatch");
      verifySignature(head, mime);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    await file.close();
    file = undefined;
    let probe: Record<string, unknown>;
    try {
      const output = await execute(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=codec_type,codec_name,width,height",
          "-of",
          "json",
          partial,
        ],
        { timeout: 120_000, maxBuffer: 1_048_576, signal: bounded },
      );
      probe = record(JSON.parse(output.stdout));
      await execute(
        "ffmpeg",
        [
          "-nostdin",
          "-hide_banner",
          "-v",
          "error",
          "-xerror",
          "-i",
          partial,
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          "-f",
          "null",
          "-",
        ],
        { timeout: 120_000, maxBuffer: 1_048_576, signal: bounded },
      );
    } catch {
      throw new ConnectorError("decode_failed");
    }
    const streams = Array.isArray(probe.streams) ? probe.streams.map(record) : [];
    const frame = streams.find((s) => s.codec_type === "video");
    const duration = Number(record(probe.format).duration);
    if (
      !frame ||
      !Number.isFinite(Number(frame.width)) ||
      !Number.isFinite(Number(frame.height)) ||
      Number(frame.width) <= 0 ||
      Number(frame.height) <= 0 ||
      (video && (!Number.isFinite(duration) || duration <= 0))
    )
      throw new ConnectorError("decode_failed");
    await rename(partial, path);
    return {
      path,
      size,
      mime,
      sha256: hash.digest("hex"),
      width: Number(frame.width),
      height: Number(frame.height),
      duration: video ? duration : undefined,
    };
  } catch (error) {
    await file?.close().catch(() => {});
    await Promise.all([rm(partial, { force: true }), rm(path, { force: true })]);
    throw error instanceof ConnectorError
      ? error
      : new ConnectorError(signal?.aborted ? "interrupted" : "download_failed");
  }
}

export async function makePoster(
  video: string,
  signal?: AbortSignal,
): Promise<DownloadedMedia | null> {
  const path = `${video}.jpg`;
  try {
    await execute(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-v",
        "error",
        "-y",
        "-ss",
        "0",
        "-i",
        video,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-q:v",
        "3",
        path,
      ],
      { timeout: 30_000, maxBuffer: 1_048_576, signal },
    );
    const { size } = await stat(path);
    if (size < 3 || size > MAX_IMAGE_BYTES) throw new ConnectorError("invalid_media");
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(path)) hash.update(bytes);
    return { path, size, mime: "image/jpeg", sha256: hash.digest("hex") };
  } catch {
    await rm(path, { force: true });
    return null;
  }
}
