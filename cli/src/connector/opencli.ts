import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ConnectorError,
  collectTweetEntities,
  normalizeXPost,
  record,
  type XCapture,
} from "./core.js";

export interface OpenCliPage {
  goto(url: string, opts: { waitUntil: "none" }): Promise<unknown>;
  evaluate(code: string): Promise<unknown>;
  newTab(url: string): Promise<string | undefined>;
  setActivePage(id: string): Promise<void>;
  cdp(method: string, params?: Record<string, unknown>): Promise<unknown>;
  closeWindow(): Promise<void>;
}
interface Bridge {
  connect(opts: Record<string, unknown>): Promise<OpenCliPage>;
  close(): Promise<void>;
}
interface Adapter {
  access: string;
  func(page: OpenCliPage, args: Record<string, unknown>): Promise<unknown>;
}

export async function withOpenCliPage<T>(
  run: (page: OpenCliPage, root: string) => Promise<T>,
  failureCode = "opencli_unavailable",
): Promise<T> {
  const root =
    process.env.ZHE_OPENCLI_ROOT ??
    resolve(
      dirname(createRequire(import.meta.url).resolve("@jackwener/opencli/registry")),
      "../..",
    );
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    version: string;
  };
  if (manifest.version !== "1.8.7") throw new ConnectorError("unsupported_opencli_version");
  const { BrowserBridge } = (await import(
    pathToFileURL(join(root, "dist/src/browser/bridge.js")).href
  )) as { BrowserBridge: new () => Bridge };
  const bridge = new BrowserBridge();
  let page: OpenCliPage | undefined;
  const close = async () => {
    await page?.closeWindow().catch(() => {});
    await bridge.close().catch(() => {});
  };
  const stop = () => {
    void close().finally(() => process.exit(143));
  };
  process.once("SIGTERM", stop);
  try {
    page = await bridge.connect({
      session: `zhe-connector-${randomUUID()}`,
      windowMode: "background",
      siteSession: "ephemeral",
      idleTimeout: 120,
    });
    return await run(page, root);
  } catch (error) {
    throw error instanceof ConnectorError ? error : new ConnectorError(failureCode);
  } finally {
    process.removeListener("SIGTERM", stop);
    await close();
  }
}

export async function readInChild(postId: string): Promise<XCapture> {
  return withOpenCliPage(async (page, root) => {
    const { getRegistry } = (await import(
      pathToFileURL(join(root, "dist/src/registry.js")).href
    )) as { getRegistry: () => Map<string, Adapter> };
    await import(pathToFileURL(join(root, "clis/twitter/thread.js")).href);
    const entities = new Map<string, unknown>();
    await page.goto(`https://x.com/i/status/${postId}`, { waitUntil: "none" });
    await new Promise((r) => setTimeout(r, 1200));
    const proxy = new Proxy(page, {
      get(target, key) {
        if (key === "goto") return (url: string) => target.goto(url, { waitUntil: "none" });
        if (key === "evaluate")
          return async (code: string) => {
            const value = await target.evaluate(code);
            if (code.includes("TweetDetail")) {
              for (const [id, post] of collectTweetEntities(value)) entities.set(id, post);
              // Stop reply pagination: the task only concerns its saved focal post.
              const instructions = record(
                record(record(value).data).threaded_conversation_with_injections_v2,
              ).instructions;
              if (Array.isArray(instructions))
                for (const instruction of instructions) {
                  const item = record(instruction);
                  if (Array.isArray(item.entries))
                    item.entries = item.entries.filter(
                      (e) =>
                        !String(record(e).entryId ?? "").startsWith("cursor-") &&
                        !record(record(e).content).cursorType,
                    );
                }
            }
            return value;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const adapter = getRegistry().get("twitter/thread");
    if (adapter?.access !== "read") throw new ConnectorError("adapter_contract_changed");
    await adapter.func(proxy, { "tweet-id": postId, limit: 1 });
    const capture = normalizeXPost(entities.get(postId), postId);
    if (!capture) throw new ConnectorError("post_unavailable");
    return capture;
  }, "needs_login");
}

/** Isolate raw browser responses and upstream logs; IPC only carries the normalized focal post. */
export function readPost(postId: string, signal?: AbortSignal): Promise<XCapture> {
  if (!/^\d{1,22}$/.test(postId)) throw new ConnectorError("invalid_post_id");
  return runOpenCliTask(["--isolated", postId], signal);
}

export function runOpenCliTask<T>(args: string[], signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new ConnectorError("interrupted"));
  return new Promise((resolveResult, reject) => {
    const child = fork(fileURLToPath(import.meta.url), args, {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let stopping = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      if (stopping) return;
      stopping = true;
      finish();
      child.kill("SIGTERM");
      // The next job waits for this process (and its browser cleanup) to exit.
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    };
    const timer = setTimeout(abort, 120_000);
    signal?.addEventListener("abort", abort, { once: true });
    child.once("message", (message: unknown) => {
      if (stopping) return;
      finish();
      const value = record(message);
      if (value.ok === true) resolveResult(value.capture as T);
      else
        reject(new ConnectorError(typeof value.code === "string" ? value.code : "connector_error"));
    });
    child.once("error", () => {
      finish();
      reject(new ConnectorError(stopping ? "interrupted" : "opencli_unavailable"));
    });
    child.once("close", () => {
      finish();
      reject(new ConnectorError(stopping ? "interrupted" : "opencli_unavailable"));
    });
    if (signal?.aborted) abort();
  });
}

export async function runIsolated(postId: string): Promise<void> {
  return sendIsolated(() => readInChild(postId));
}

async function sendIsolated(task: () => Promise<unknown>): Promise<void> {
  let result: { ok: true; capture: unknown } | { ok: false; code: string };
  try {
    result = { ok: true, capture: await task() };
  } catch (error) {
    result = {
      ok: false,
      code: error instanceof ConnectorError ? error.code : "opencli_unavailable",
    };
  }
  try {
    await new Promise<void>((done, reject) => {
      if (!process.send) return reject(new ConnectorError("opencli_unavailable"));
      process.send(result, (error) => (error ? reject(error) : done()));
    });
  } finally {
    process.disconnect?.();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--isolated") await runIsolated(process.argv[3] ?? "");
  if (process.argv[2] === "--screenshot")
    // Finish evaluating this module before the screenshot task imports its helpers.
    void sendIsolated(async () => {
      const { captureScreenshotInChild } = await import("./screenshot.js");
      return captureScreenshotInChild(process.argv[3] ?? "", process.argv[4] ?? "");
    });
}
