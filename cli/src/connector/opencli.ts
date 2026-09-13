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

interface Page {
  goto(url: string, opts: { waitUntil: "none" }): Promise<unknown>;
  evaluate(code: string): Promise<unknown>;
  closeWindow(): Promise<void>;
}
interface Bridge {
  connect(opts: Record<string, unknown>): Promise<Page>;
  close(): Promise<void>;
}
interface Adapter {
  access: string;
  func(page: Page, args: Record<string, unknown>): Promise<unknown>;
}

export async function readInChild(postId: string): Promise<XCapture> {
  const root =
    process.env.ZHE_OPENCLI_ROOT ??
    resolve(
      dirname(createRequire(import.meta.url).resolve("@jackwener/opencli/registry")),
      "../..",
    );
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    version: string;
  };
  if (manifest.version !== "1.8.6") throw new ConnectorError("unsupported_opencli_version");
  const { BrowserBridge } = (await import(
    pathToFileURL(join(root, "dist/src/browser/bridge.js")).href
  )) as { BrowserBridge: new () => Bridge };
  const { getRegistry } = (await import(
    pathToFileURL(join(root, "dist/src/registry.js")).href
  )) as { getRegistry: () => Map<string, Adapter> };
  await import(pathToFileURL(join(root, "clis/twitter/thread.js")).href);
  const bridge = new BrowserBridge();
  let page: Page | undefined;
  const entities = new Map<string, unknown>();
  try {
    page = await bridge.connect({
      session: `zhe-connector-${randomUUID()}`,
      windowMode: "background",
      siteSession: "ephemeral",
    });
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
  } catch (error) {
    throw error instanceof ConnectorError ? error : new ConnectorError("needs_login");
  } finally {
    await page?.closeWindow().catch(() => {});
    await bridge.close().catch(() => {});
  }
}

/** Isolate raw browser responses and upstream logs; IPC only carries the normalized focal post. */
export function readPost(postId: string, signal?: AbortSignal): Promise<XCapture> {
  if (!/^\d{1,22}$/.test(postId)) throw new ConnectorError("invalid_post_id");
  return new Promise((resolveResult, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ["--isolated", postId], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      child.kill("SIGTERM");
      finish();
      reject(new ConnectorError("interrupted"));
    };
    const timer = setTimeout(abort, 120_000);
    signal?.addEventListener("abort", abort, { once: true });
    child.once("message", (message: unknown) => {
      finish();
      const value = record(message);
      if (value.ok === true) resolveResult(value.capture as XCapture);
      else
        reject(new ConnectorError(typeof value.code === "string" ? value.code : "connector_error"));
    });
    child.once("error", () => {
      finish();
      reject(new ConnectorError("opencli_unavailable"));
    });
    child.once("close", () => {
      finish();
      reject(new ConnectorError("opencli_unavailable"));
    });
    if (signal?.aborted) abort();
  });
}

export async function runIsolated(postId: string): Promise<void> {
  let result: { ok: true; capture: XCapture } | { ok: false; code: string };
  try {
    result = { ok: true, capture: await readInChild(postId) };
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

if (
  process.argv[2] === "--isolated" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await runIsolated(process.argv[3] ?? "");
