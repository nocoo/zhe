// Runs only inside the isolated Eagle attempt process group, never in the enrich process.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { downloadMedia } from "./download.js";
import type { EagleTask } from "./eagle.js";

export async function prepareEagle(task: EagleTask, directory: string): Promise<void> {
  const file = await downloadMedia(task.media, directory, undefined, undefined, {
    maxPixels: 20_000_000,
    maxDimension: 10_000,
  });
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.mime];
  if (!ext || !file.width || !file.height || file.width * file.height > 20_000_000)
    throw new Error("invalid_media");
  await rename(file.path, join(directory, `original.${ext}`));
  const thumbnail = join(directory, "thumbnail.png");
  await promisify(execFile)(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-y",
      "-threads",
      "1",
      "-i",
      join(directory, `original.${ext}`),
      "-frames:v",
      "1",
      "-vf",
      "scale=640:640:force_original_aspect_ratio=decrease",
      thumbnail,
    ],
    { timeout: 30_000, maxBuffer: 65_536 },
  );
  const bytes = await readFile(thumbnail);
  if (
    bytes.length < 24 ||
    bytes.length > 10 * 1024 * 1024 ||
    bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a"
  )
    throw new Error("invalid_thumbnail");
  for (const path of [join(directory, `original.${ext}`), thumbnail]) {
    const file = await open(path, "r");
    try {
      await file.sync();
    } finally {
      await file.close();
    }
  }
  const manifest = await open(join(directory, "prepared.json.tmp"), "wx", 0o600);
  try {
    await manifest.writeFile(
      JSON.stringify({
        ext,
        size: file.size,
        sha256: file.sha256,
        width: file.width,
        height: file.height,
        thumbnailSha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    );
    await manifest.sync();
  } finally {
    await manifest.close();
  }
  await rename(join(directory, "prepared.json.tmp"), join(directory, "prepared.json"));
  const parent = await open(directory, "r");
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

// The Python supervisor supplies a local queue path and a private work directory.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [path, directory] = process.argv.slice(2);
  try {
    await prepareEagle(JSON.parse(await readFile(path, "utf8")), directory);
  } catch {
    process.exitCode = 1;
  }
}
