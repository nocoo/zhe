import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getEagleConfig, type ZheConfig } from "../config.js";
import { mediaUrl, type XCapture } from "./core.js";

export interface EagleConfig {
  libraryPath: string;
  timeoutMs: number;
  retryMs: number;
}
export interface EagleEvent {
  event: "eagle";
  code:
    | "queued"
    | "saved"
    | "exists"
    | "retry"
    | "timeout"
    | "invalid_config"
    | "queue_error"
    | "skipped"
    | "duplicate"
    | "quota"
    | "missing_dependency"
    | "quarantined"
    | "quarantine_conflict"
    | "paused_library";
  item?: string;
  attempts?: number;
  retryAt?: number;
  reason?:
    | "download_failed"
    | "drive_unavailable"
    | "conflict"
    | "quota"
    | "no_photos"
    | "too_many"
    | "invalid_media"
    | "invalid_post";
}
export type EagleLog = (event: EagleEvent) => void;
export interface EagleSink {
  submit(capture: XCapture): void;
}
export interface EagleTask {
  version: 1;
  key: string;
  libraryPath: string;
  postId: string;
  media: XCapture["media"][number];
  username: string;
  text: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  done: boolean;
  retryMs: number;
  timeoutMs: number;
}

/** Config is explicit, local, and never points at an inferred Drive account. */
export function eagleConfig(value: ZheConfig["eagle"]): EagleConfig | undefined {
  if (!value || value.enabled === false) return;
  if (
    value.enabled !== true ||
    !["darwin", "linux"].includes(process.platform) ||
    typeof value.libraryPath !== "string" ||
    !isAbsolute(value.libraryPath) ||
    !value.libraryPath.endsWith(".library") ||
    value.libraryPath.includes("\0") ||
    !Number.isInteger(value.timeoutMs ?? 120_000) ||
    (value.timeoutMs ?? 120_000) < 1000 ||
    (value.timeoutMs ?? 120_000) > 600_000 ||
    !Number.isInteger(value.retryMs ?? 5000) ||
    (value.retryMs ?? 5000) < 1000 ||
    (value.retryMs ?? 5000) > 300_000
  )
    throw new Error("invalid_config");
  return {
    libraryPath: normalize(value.libraryPath),
    timeoutMs: value.timeoutMs ?? 120_000,
    retryMs: value.retryMs ?? 5000,
  };
}

export async function checkEaglePrerequisites(): Promise<void> {
  try {
    await promisify(execFile)(
      "python3",
      [
        "-c",
        "import sys,ctypes,fcntl; assert sys.version_info >= (3,9); getattr(ctypes.CDLL(None), 'renameatx_np' if sys.platform == 'darwin' else 'renameat2')",
      ],
      { timeout: 5000 },
    );
    for (const command of ["ffmpeg", "ffprobe"])
      await promisify(execFile)(command, ["-version"], { timeout: 5000, maxBuffer: 65_536 });
  } catch {
    throw new Error("Eagle sidecar requires macOS/Linux, Python 3.9+, FFmpeg and ffprobe on PATH.");
  }
}

async function readTask(path: string): Promise<EagleTask> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 1_048_576) throw new Error("invalid_task");
    return JSON.parse(await file.readFile("utf8"));
  } finally {
    await file.close();
  }
}

function validTask(task: EagleTask, name: string): boolean {
  return (
    task?.version === 1 &&
    typeof task.libraryPath === "string" &&
    isAbsolute(task.libraryPath) &&
    task.libraryPath.endsWith(".library") &&
    !task.libraryPath.includes("\0") &&
    typeof task.postId === "string" &&
    /^\d{1,22}$/.test(task.postId) &&
    typeof task.username === "string" &&
    /^[a-zA-Z0-9_]{1,50}$/.test(task.username) &&
    typeof task.text === "string" &&
    task.text.length <= 100_000 &&
    task.media?.type === "PHOTO" &&
    typeof task.media.id === "string" &&
    typeof task.media.url === "string" &&
    Boolean(mediaUrl(task.media.url, task.media.id, "photo")) &&
    task.key === name.slice(0, -5) &&
    task.key === eagleKey(task.libraryPath, task.postId, task.media.id) &&
    typeof task.done === "boolean" &&
    Number.isSafeInteger(task.attempts) &&
    task.attempts >= 0 &&
    Number.isSafeInteger(task.nextAttemptAt) &&
    task.nextAttemptAt >= 0 &&
    Number.isSafeInteger(task.createdAt) &&
    task.createdAt > 0 &&
    Number.isInteger(task.timeoutMs) &&
    task.timeoutMs >= 1000 &&
    task.timeoutMs <= 600_000 &&
    Number.isInteger(task.retryMs) &&
    task.retryMs >= 1000 &&
    task.retryMs <= 300_000
  );
}

export function eagleKey(libraryPath: string, postId: string, mediaId: string): string {
  return createHash("sha256")
    .update(JSON.stringify([libraryPath, postId, mediaId]))
    .digest("hex");
}

export type EagleAttempt = (
  path: string,
  timeoutMs: number,
  signal: AbortSignal,
) => Promise<EagleEvent["code"]>;

/** A process group bounds Python, Node, FFmpeg and even blocked Drive filesystem calls. */
const nativeScript = fileURLToPath(new URL("./eagle-native.py", import.meta.url));
const acceptedCodes = [
  "saved",
  "exists",
  "queued",
  "duplicate",
  "quota",
  "retry",
  "quarantined",
  "quarantine_conflict",
] as const;
export async function checkEagleLibrary(path: string): Promise<void> {
  if (
    (await runNative(["--validate-library", path], 5000, new AbortController().signal)) !== "exists"
  )
    throw new Error(
      "Eagle library is unavailable or invalid; use an existing .library with real directories and root metadata.json.",
    );
}
export const runEagleAttempt: EagleAttempt = (path, timeoutMs, signal) =>
  runNative(
    [path, process.execPath, fileURLToPath(new URL("./eagle-worker.js", import.meta.url))],
    timeoutMs,
    signal,
  );

function runNative(
  args: string[],
  timeoutMs: number,
  signal: AbortSignal,
  input?: string,
): Promise<EagleEvent["code"]> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve("retry");
      return;
    }
    const child = spawn("python3", [nativeScript, ...args], {
      detached: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    let output = "";
    let settled = false;
    const finish = (code: EagleEvent["code"]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      child.stdout.destroy();
      child.stdin.destroy();
      child.unref();
      resolve(code);
    };
    const kill = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* already exited */
        }
      }
    };
    const stop = () => {
      kill();
      finish("retry");
    };
    const timer = setTimeout(() => {
      kill();
      finish("timeout");
    }, timeoutMs);
    signal.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (data: Buffer) => {
      if (output.length < 128) output = (output + data.toString()).slice(0, 128);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    child.once("error", () => finish("missing_dependency"));
    child.once("close", (code) =>
      finish(
        code === 0 && (acceptedCodes as readonly string[]).includes(output.trim())
          ? (output.trim() as EagleEvent["code"])
          : "retry",
      ),
    );
  });
}

/** Enrichment never awaits this outbox. Only local disk is touched in this process. */
export class EagleSidecar implements EagleSink {
  private pending = new Set<Promise<void>>();
  private active = new Set<string>();
  private scanning = false;
  private rescan = false;
  private cooldown = new Map<string, number>();
  private paused = new Set<string>();
  private blocked = new Set<string>();
  private enqueuing = new Set<Promise<void>>();
  private stopping = false;
  private controller = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private config: EagleConfig,
    private directory: string,
    private log: EagleLog,
    private attempt: EagleAttempt = runEagleAttempt,
  ) {}

  private emit(code: EagleEvent["code"], item?: string, details: Partial<EagleEvent> = {}) {
    try {
      this.log({ event: "eagle", code, ...(item ? { item } : {}), ...details });
    } catch {
      /* logging is isolated */
    }
  }

  private track(promise: Promise<void>) {
    const safe = promise
      .catch(() => this.emit("queue_error"))
      .finally(() => this.pending.delete(safe));
    this.pending.add(safe);
  }

  initialize(check: () => Promise<void>) {
    this.track(
      check()
        .then(() => this.start())
        .catch(() => {
          this.emit("missing_dependency");
          this.controller.abort();
        }),
    );
  }

  start() {
    if (this.controller.signal.aborted || this.stopping) return;
    this.track(
      runNative(["--maintenance", this.directory], 5000, this.controller.signal).then(() =>
        this.recover(),
      ),
    );
    this.timer ??= setInterval(() => this.recover(), 1000);
    this.timer.unref();
  }

  submit(capture: XCapture): void {
    if (this.controller.signal.aborted || this.stopping) return;
    const photos = capture.media.filter((media) => media.type === "PHOTO");
    if (!photos.length || photos.length > 4) {
      this.emit("skipped", undefined, { reason: photos.length ? "too_many" : "no_photos" });
      return;
    }
    if (
      !/^\d{1,22}$/.test(capture.tweet.id) ||
      !/^[a-zA-Z0-9_]{1,50}$/.test(capture.tweet.author.username)
    ) {
      this.emit("skipped", undefined, { reason: "invalid_post" });
      return;
    }
    const inserts: Promise<void>[] = [];
    for (const media of photos) {
      if (!mediaUrl(media.url, media.id, "photo")) {
        this.emit("skipped", undefined, { reason: "invalid_media" });
        continue;
      }
      const task: EagleTask = {
        version: 1,
        key: eagleKey(this.config.libraryPath, capture.tweet.id, media.id),
        libraryPath: this.config.libraryPath,
        postId: capture.tweet.id,
        media: { id: media.id, type: "PHOTO", url: media.url },
        username: capture.tweet.author.username,
        text: capture.tweet.text.slice(0, 100_000),
        createdAt: Date.now(),
        attempts: 0,
        nextAttemptAt: 0,
        done: false,
        retryMs: this.config.retryMs,
        timeoutMs: this.config.timeoutMs,
      };
      inserts.push(
        runNative(
          ["--enqueue", this.directory],
          5000,
          this.controller.signal,
          JSON.stringify(task),
        ).then((code) => {
          this.emit(code, task.key);
        }),
      );
    }
    const enqueue = Promise.allSettled(inserts)
      .then((results) => {
        if (results.some((result) => result.status === "rejected")) this.emit("queue_error");
        this.recover();
      })
      .finally(() => {
        this.enqueuing.delete(enqueue);
      });
    this.enqueuing.add(enqueue);
    this.track(enqueue);
  }

  recover(): void {
    if (this.controller.signal.aborted || this.stopping) return;
    if (this.scanning) {
      this.rescan = true;
      return;
    }
    this.scanning = true;
    this.track(
      this.scan().finally(() => {
        this.scanning = false;
        if (this.rescan) {
          this.rescan = false;
          this.recover();
        }
      }),
    );
  }

  private async scan() {
    const entries = await readdir(this.directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const names = new Set(entries);
    for (const state of [this.cooldown, this.paused, this.blocked]) {
      for (const name of state.keys()) if (!names.has(name)) state.delete(name);
    }
    for (const name of entries) {
      if (this.active.size >= 4 || this.controller.signal.aborted) break;
      if (
        !/^[a-f0-9]{64}\.json$/.test(name) ||
        this.active.has(name) ||
        this.blocked.has(name) ||
        (this.cooldown.get(name) ?? 0) > Date.now()
      )
        continue;
      const path = join(this.directory, name);
      try {
        const task = await readTask(path);
        if (!validTask(task, name)) throw new Error("invalid_task");
        if (task.libraryPath !== this.config.libraryPath) {
          if (!this.paused.has(name)) {
            this.emit("paused_library", name.slice(0, -5));
            this.paused.add(name);
          }
          continue;
        }
        const state = task as EagleTask & { lastError?: string };
        if (state.lastError === "conflict") throw new Error("conflict");
        if (task.done) {
          this.emit(await runEagleAttempt(path, task.timeoutMs, this.controller.signal), task.key);
          continue;
        }
        if (task.nextAttemptAt > Date.now()) continue;
        this.active.add(name);
        this.cooldown.set(name, Date.now() + task.retryMs);
        this.track(
          this.attempt(path, task.timeoutMs, this.controller.signal)
            .then(async (code) => {
              const state = JSON.parse(await readFile(path, "utf8").catch(() => "{}"));
              this.emit(code, name.slice(0, -5), {
                ...(Number.isSafeInteger(state.attempts) && state.attempts >= 0
                  ? { attempts: state.attempts }
                  : {}),
                ...(Number.isSafeInteger(state.nextAttemptAt) && state.nextAttemptAt > 0
                  ? { retryAt: state.nextAttemptAt }
                  : {}),
                ...(["download_failed", "drive_unavailable", "conflict", "quota"].includes(
                  state.lastError,
                )
                  ? { reason: state.lastError }
                  : {}),
              });
            })
            .finally(() => {
              this.active.delete(name);
              this.cooldown.set(name, Date.now() + task.retryMs);
              this.recover();
            }),
        );
      } catch {
        const code = await runNative(["--quarantine", path], 5000, this.controller.signal);
        this.blocked.add(name);
        this.emit(code, name.slice(0, -5));
      }
    }
  }

  /** once waits for its independent attempts only after printing the enrichment result. */
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await Promise.all([...this.enqueuing]);
    this.controller.abort();
    await this.drain();
  }
}

export function configuredEagle(
  log: EagleLog,
  check = checkEaglePrerequisites,
): EagleSidecar | undefined {
  try {
    const config = eagleConfig(getEagleConfig());
    if (!config) return;
    const sidecar = new EagleSidecar(
      config,
      join(
        homedir(),
        ".config",
        "zhe",
        process.env.ZHE_DEV === "1" ? "eagle-outbox-dev" : "eagle-outbox",
      ),
      log,
    );
    sidecar.initialize(check);
    return sidecar;
  } catch {
    log({ event: "eagle", code: "invalid_config" });
    return;
  }
}
