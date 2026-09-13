import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readInChild, readPost, runIsolated } from "../src/connector/opencli.js";

const forkMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ fork: forkMock }));
const postId = "2000000000000000001";
const raw = {
  rest_id: postId,
  legacy: { full_text: "Synthetic focal post", created_at: "2026-09-12T00:00:00Z" },
  core: {
    user_results: { result: { rest_id: "1", legacy: { screen_name: "example", name: "Example" } } },
  },
};
let child: EventEmitter & { kill: ReturnType<typeof vi.fn> };
let root: string;
let state: {
  options?: unknown;
  urls: string[];
  closeWindow: number;
  closed: number;
  access: string;
  error: string;
  payload: unknown;
  entries?: unknown[];
  args?: unknown;
  bound?: boolean;
};
const originalSend = process.send;
const originalDisconnect = process.disconnect;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "zhe-opencli-contract-"));
  await mkdir(join(root, "dist/src/browser"), { recursive: true });
  await mkdir(join(root, "clis/twitter"), { recursive: true });
  await writeFile(
    join(root, "dist/src/browser/bridge.js"),
    `
export class BrowserBridge {
  async connect(options) {
    const s = globalThis.__zheConnectorTest; s.options = options;
    if (s.error === 'connect') throw new Error('private upstream error');
    return {
      identity: 'page',
      async goto(url) { s.urls.push(url); },
      async evaluate(code) { if (s.error === 'evaluate') throw new Error('private upstream error'); return code === 'TweetDetail' ? structuredClone(s.payload) : {}; },
      getCookies() { s.bound = this.identity === 'page'; return []; },
      async closeWindow() { s.closeWindow++; if (s.error === 'close') throw new Error('close'); }
    };
  }
  async close() { const s = globalThis.__zheConnectorTest; s.closed++; if (s.error === 'close') throw new Error('close'); }
}`,
  );
  await writeFile(
    join(root, "dist/src/registry.js"),
    `
export function getRegistry() {
  const s = globalThis.__zheConnectorTest;
  return new Map(s.access === 'missing' ? [] : [['twitter/thread', {
    access: s.access,
    async func(page, args) {
      s.args = args; page.getCookies(); void page.identity;
      await page.goto('https://x.com/i/status/' + args['tweet-id']);
      await page.evaluate('bootstrap');
      const result = await page.evaluate('TweetDetail');
      s.entries = result?.data?.threaded_conversation_with_injections_v2?.instructions?.[0]?.entries;
    }
  }]]);
}`,
  );
  await writeFile(join(root, "clis/twitter/thread.js"), "export {};\n");
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
beforeEach(async () => {
  vi.useFakeTimers();
  child = Object.assign(new EventEmitter(), { kill: vi.fn() });
  forkMock.mockReset().mockReturnValue(child);
  state = {
    urls: [],
    closeWindow: 0,
    closed: 0,
    access: "read",
    error: "",
    payload: {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              entries: [
                { entryId: "tweet", content: { tweet: raw } },
                { entryId: "cursor-bottom" },
                { content: { cursorType: "Bottom" } },
                {},
              ],
            },
            {},
          ],
        },
      },
    },
  };
  vi.stubGlobal("__zheConnectorTest", state);
  vi.stubEnv("ZHE_OPENCLI_ROOT", root);
  await writeFile(join(root, "package.json"), JSON.stringify({ type: "module", version: "1.8.6" }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  process.send = originalSend;
  process.disconnect = originalDisconnect;
});

async function captureChild() {
  const result = readInChild(postId);
  // Attach a rejection handler immediately; an expected failure must not leak an unhandled rejection.
  const settled = result.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.waitFor(() => expect(state.options).toBeDefined());
  await vi.advanceTimersByTimeAsync(1200);
  const output = await settled;
  if ("error" in output) throw output.error;
  return output.value;
}

describe("isolated OpenCLI parent boundary", () => {
  it("only forks numeric targets and never inherits upstream stdout or stderr", async () => {
    expect(() => readPost("bad-id")).toThrow("invalid_post_id");
    const result = readPost(postId);
    child.emit("message", { ok: true, capture: { tweet: { id: postId }, media: [] } });
    expect(await result).toMatchObject({ tweet: { id: postId } });
    expect(forkMock).toHaveBeenCalledWith(expect.any(String), ["--isolated", postId], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
  });
  it.each(["message", "error", "close"])("sanitizes child %s failures", async (event) => {
    const result = readPost(postId);
    const check = expect(result).rejects.toThrow(
      event === "message" ? "needs_login" : "opencli_unavailable",
    );
    child.emit(
      event,
      event === "message" ? { ok: false, code: "needs_login" } : new Error("private detail"),
    );
    await check;
  });
  it("handles malformed child messages", async () => {
    const result = readPost(postId);
    const check = expect(result).rejects.toThrow("connector_error");
    child.emit("message", null);
    await check;
  });
  it.each(["before", "during", "timeout"])("terminates an interrupted child: %s", async (when) => {
    const controller = new AbortController();
    if (when === "before") controller.abort();
    const check = expect(readPost(postId, controller.signal)).rejects.toThrow("interrupted");
    if (when === "during") controller.abort();
    if (when === "timeout") await vi.advanceTimersByTimeAsync(120_000);
    await check;
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("pinned OpenCLI adapter contract", () => {
  it("reads the focal post, strips reply cursors and always closes its background session", async () => {
    expect(await captureChild()).toMatchObject({
      tweet: { id: postId, text: "Synthetic focal post" },
    });
    expect(state.options).toMatchObject({
      session: expect.stringMatching(/^zhe-connector-/),
      windowMode: "background",
      siteSession: "ephemeral",
    });
    expect(state.args).toEqual({ "tweet-id": postId, limit: 1 });
    expect(state.entries).toHaveLength(2);
    expect(state.bound).toBe(true);
    expect(state.closeWindow).toBe(1);
    expect(state.closed).toBe(1);
  });
  it("refuses an unsupported adapter version before opening the browser", async () => {
    await writeFile(join(root, "package.json"), '{"version":"0.0.0"}');
    await expect(readInChild(postId)).rejects.toThrow("unsupported_opencli_version");
    expect(state.urls).toEqual([]);
  });
  it.each(["write", "missing"])("refuses changed adapter capability: %s", async (access) => {
    state.access = access;
    await expect(captureChild()).rejects.toThrow("adapter_contract_changed");
    expect(state.closed).toBe(1);
  });
  it.each(["connect", "evaluate"])(
    "maps browser %s failures to a safe login error",
    async (error) => {
      state.error = error;
      await expect(captureChild()).rejects.toThrow("needs_login");
      expect(state.closed).toBe(1);
    },
  );
  it("rejects a missing focal post while still closing the session", async () => {
    state.payload = {};
    await expect(captureChild()).rejects.toThrow("post_unavailable");
    expect(state.closeWindow).toBe(1);
  });
  it("does not lose a successful capture to cleanup errors", async () => {
    state.error = "close";
    expect(await captureChild()).toMatchObject({ tweet: { id: postId } });
  });
  it("sends only normalized data through IPC and disconnects", async () => {
    const send = vi.fn((_message, callback) => callback(null));
    process.send = send;
    process.disconnect = vi.fn();
    const result = runIsolated(postId);
    await vi.waitFor(() => expect(state.options).toBeDefined());
    await vi.advanceTimersByTimeAsync(1200);
    await result;
    expect(send.mock.calls[0]?.[0]).toMatchObject({ ok: true, capture: { tweet: { id: postId } } });
    expect(process.disconnect).toHaveBeenCalledOnce();
  });
  it("sanitizes missing installations and reports IPC failures", async () => {
    vi.stubEnv("ZHE_OPENCLI_ROOT", join(root, "missing"));
    const send = vi.fn((_message, callback) => callback(null));
    process.send = send;
    process.disconnect = vi.fn();
    await runIsolated(postId);
    expect(send.mock.calls[0]?.[0]).toEqual({ ok: false, code: "opencli_unavailable" });
    send.mockImplementation((_message, callback) => callback(new Error("ipc closed")));
    await expect(runIsolated(postId)).rejects.toThrow("ipc closed");
    process.send = undefined;
    await expect(runIsolated(postId)).rejects.toThrow("opencli_unavailable");
  });
});
