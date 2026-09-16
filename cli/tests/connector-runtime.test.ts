import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiClientError } from "../src/api/client.js";
import { getApiKey } from "../src/config.js";
import { ConnectorError, normalizeXPost } from "../src/connector/core.js";
import { downloadMedia, makePoster } from "../src/connector/download.js";
import { trimConnectorLog } from "../src/connector/log-file.js";
import { readPost } from "../src/connector/opencli.js";
import { processOne, runOnce, watchConnector } from "../src/connector/runtime.js";

vi.mock("../src/connector/opencli.js", () => ({ readPost: vi.fn() }));
vi.mock("../src/connector/log-file.js", () => ({ trimConnectorLog: vi.fn() }));
vi.mock("../src/connector/download.js", () => ({ downloadMedia: vi.fn(), makePoster: vi.fn() }));
vi.mock("../src/config.js", () => ({ getApiKey: vi.fn(), getEagleConfig: vi.fn() }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, mkdtemp: vi.fn(fs.mkdtemp) };
});

const postId = "2000000000000000001";
const job = {
  linkId: 1,
  postId,
  userId: "owner",
  sourceUrl: `https://x.com/i/status/${postId}`,
  leaseToken: "a2e5b98b-96ae-4f8d-8a08-82c23c70dbee",
  leaseUntil: Date.now() + 180_000,
  attempts: 1,
};
const capture = normalizeXPost(
  {
    rest_id: postId,
    legacy: { full_text: "Synthetic saved post", created_at: "2026-09-12T00:00:00Z" },
    core: {
      user_results: { result: { rest_id: "123", legacy: { screen_name: "test", name: "Test" } } },
    },
  },
  postId,
);
assert(capture);
let requests: { path: string; init: RequestInit }[];
let dir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  dir = await mkdtemp(join(tmpdir(), "zhe-cli-test-"));
  requests = [];
  vi.mocked(getApiKey).mockReturnValue("zhe_shared_cli_key");
  vi.mocked(readPost).mockResolvedValue(structuredClone(capture));
  vi.mocked(makePoster).mockResolvedValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ path: new URL(url).pathname, init });
      const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
      const data = new URL(url).pathname.endsWith("/connector")
        ? init.method === "GET"
          ? {
              states: [{ state: "pending", count: 1 }],
              keyPrefix: "zhe_private_prefix",
              expiresAt: Date.now() + 86400_000,
            }
          : { job }
        : body.action === "reserve"
          ? { asset: { id: "asset", key: "test/asset.mp4", uploaded: false } }
          : { ok: true };
      return Response.json(data);
    }),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("zhe connector", () => {
  it("submits the sidecar before a failed Zhe capture and gives it an independent snapshot", async () => {
    const data = structuredClone(capture);
    data.media = [{ id: "222", type: "PHOTO", url: "https://pbs.twimg.com/media/test.jpg" }];
    vi.mocked(readPost).mockResolvedValue(data);
    const submitted: (typeof data)[] = [];
    const client = new ApiClient("fixture");
    const original = client.connectorAction.bind(client);
    vi.spyOn(client, "connectorAction").mockImplementation((job, body, signal) => {
      if ((body as { action: string }).action === "capture") {
        expect(submitted).toHaveLength(1);
        return Promise.reject(new ApiClientError(500, "offline"));
      }
      return original(job, body, signal);
    });
    expect(
      await processOne(client, undefined, undefined, { submit: (value) => submitted.push(value) }),
    ).toMatchObject({ status: "failed" });
    data.media[0].url = "changed by enrich";
    expect(submitted[0].media[0].url).toContain("pbs.twimg.com");
  });
  it("never awaits a blocked sidecar or fails enrichment because its submission throws", async () => {
    const submit = vi.fn(() => new Promise<void>(() => {}));
    expect(
      await processOne(new ApiClient("fixture"), undefined, undefined, { submit }),
    ).toMatchObject({ status: "complete" });
    expect(submit).toHaveBeenCalledOnce();
    expect(
      await processOne(new ApiClient("fixture"), undefined, undefined, {
        submit: () => {
          throw new Error("Drive unavailable");
        },
      }),
    ).toMatchObject({ status: "complete" });
  });
  it("releases its heartbeat and reports failure if temporary storage is unavailable", async () => {
    vi.useFakeTimers();
    vi.mocked(mkdtemp).mockRejectedValueOnce(new Error("disk full"));
    expect(await processOne(new ApiClient("zhe_test"))).toEqual({
      status: "failed",
      media: 0,
      error: "connector_error",
    });
    expect(readPost).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(requests.at(-1)?.init.body).toBe(
      JSON.stringify({ action: "fail", code: "connector_error" }),
    );
  });
  it("renews a long-running capture, avoids overlapping heartbeats, and clears timers", async () => {
    vi.useFakeTimers();
    let finishCapture: (() => void) | undefined;
    vi.mocked(readPost).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCapture = () => resolve(structuredClone(capture));
        }),
    );
    const client = new ApiClient("zhe_test");
    const original = client.connectorAction.bind(client);
    let finishRenew: (() => void) | undefined;
    const actions = vi.spyOn(client, "connectorAction").mockImplementation((job, body, signal) =>
      (body as { action: string }).action === "renew"
        ? new Promise((resolve) => {
            finishRenew = () => resolve({ ok: true });
          })
        : original(job, body, signal),
    );
    const result = processOne(client);
    await vi.waitFor(() => expect(finishCapture).toBeTypeOf("function"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(
      actions.mock.calls.filter(([, body]) => (body as { action: string }).action === "renew"),
    ).toHaveLength(1);
    assert(finishRenew);
    finishRenew();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(
      actions.mock.calls.filter(([, body]) => (body as { action: string }).action === "renew"),
    ).toHaveLength(2);
    assert(finishRenew);
    finishRenew();
    assert(finishCapture);
    finishCapture();
    expect(await result).toMatchObject({ status: "complete" });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts capture when a heartbeat loses its lease", async () => {
    vi.useFakeTimers();
    vi.mocked(readPost).mockImplementation(
      (_id, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );
    const client = new ApiClient("zhe_test");
    const original = client.connectorAction.bind(client);
    vi.spyOn(client, "connectorAction").mockImplementation((job, body, signal) =>
      (body as { action: string }).action === "renew"
        ? Promise.reject(new ApiClientError(409, "lease lost"))
        : original(job, body, signal),
    );
    const result = processOne(client);
    await vi.waitFor(() => expect(readPost).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ status: "failed", error: "interrupted" });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["success", "unauthenticated", "rejected", "unknown"])(
    "keeps background logs safe and stops promptly: %s",
    async (outcome) => {
      const controller = new AbortController();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      if (outcome === "unauthenticated") vi.mocked(getApiKey).mockReturnValue(undefined);
      if (outcome === "rejected")
        vi.mocked(fetch).mockResolvedValue(
          Response.json({ error: "private auth detail" }, { status: 401 }),
        );
      if (outcome === "unknown")
        vi.mocked(getApiKey).mockImplementationOnce(() => {
          throw new Error("private config detail");
        });
      vi.mocked(delay).mockImplementation(async () => {
        controller.abort();
        throw new Error("aborted");
      });
      await watchConnector(controller.signal, true);
      const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
      expect(events[0].event).toBe("ready");
      expect(events.at(-1).event).toBe("stopped");
      expect(JSON.stringify(events)).not.toMatch(/private|leaseToken|zhe_shared_cli_key/);
      const offline = events.find((event) => event.event === "offline");
      if (outcome !== "success")
        expect(offline).toMatchObject({
          status: "offline",
          code:
            outcome === "unauthenticated"
              ? "missing_api_key"
              : outcome === "rejected"
                ? 401
                : "connector_error",
        });
      if (outcome === "unauthenticated") {
        expect(fetch).not.toHaveBeenCalled();
        expect(offline.message).toContain("no request was sent");
        expect(offline.message).not.toMatch(/expired|revoked/);
      }
      if (outcome === "rejected") {
        expect(fetch).toHaveBeenCalled();
        expect(offline.message).toContain("Zhe rejected the API Key");
        expect(offline.message).toContain("`zhe logout`, then `zhe login`");
      }
      expect(delay).toHaveBeenCalledWith(20_000, undefined, { signal: controller.signal });
    },
  );
  it("shows in-flight progress without claiming overlapping jobs and summarizes confirmed uploads", async () => {
    vi.useFakeTimers();
    vi.mocked(trimConnectorLog).mockRejectedValue(new Error("log storage unavailable"));
    const controller = new AbortController();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const events = () => log.mock.calls.map(([line]) => JSON.parse(String(line)));
    const data = structuredClone(capture);
    data.media = data.tweet.media = [
      { id: "2000000000000000002", type: "PHOTO", url: "https://pbs.twimg.com/media/test.jpg" },
    ];
    vi.mocked(readPost).mockResolvedValue(data);
    const path = join(dir, "photo.jpg");
    await writeFile(path, new Uint8Array(32));
    let finish: (() => void) | undefined;
    vi.mocked(downloadMedia).mockImplementation(
      (_media, _directory, _signal, progress) =>
        new Promise((resolve) => {
          progress?.("download", 16, 32);
          finish = () => {
            progress?.("verify", 32, 32);
            resolve({ path, size: 32, sha256: "a".repeat(64), mime: "image/jpeg" });
          };
        }),
    );
    vi.mocked(delay).mockImplementation(async () => {
      controller.abort();
    });
    const running = watchConnector(controller.signal, true);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(events().some((event) => event.stage === "download" && event.received === 16)).toBe(
      true,
    );
    await vi.advanceTimersByTimeAsync(61_000);
    expect(trimConnectorLog).toHaveBeenCalledOnce();
    expect(events().some((event) => event.event === "working")).toBe(true);
    expect(
      requests.filter(
        (request) => request.path.endsWith("/connector") && request.init.method === "POST",
      ),
    ).toHaveLength(1);
    expect(delay).not.toHaveBeenCalled();
    assert(finish);
    finish();
    await running;
    expect(events().at(-1)).toMatchObject({
      event: "stopped",
      stats: { complete: 1, media: 1, bytes: 32, failed: 0 },
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("archives photos and video posters and honors server-side deletion markers", async () => {
    const data = structuredClone(capture);
    data.media = data.tweet.media = [
      { id: "2000000000000000002", type: "PHOTO", url: "https://pbs.twimg.com/media/test.jpg" },
      {
        id: "2000000000000000003",
        type: "VIDEO",
        url: "https://video.twimg.com/ext_tw_video/2000000000000000003/pu/vid/1280x720/test.mp4",
      },
    ];
    vi.mocked(readPost).mockResolvedValue(data);
    const path = join(dir, "media");
    await writeFile(path, new Uint8Array(32));
    const file = { path, mime: "image/jpeg", size: 32, sha256: "a".repeat(64) };
    vi.mocked(downloadMedia).mockResolvedValue(file);
    vi.mocked(makePoster).mockResolvedValue(file);
    const client = new ApiClient("zhe_test");
    const original = client.connectorAction.bind(client);
    vi.spyOn(client, "connectorAction").mockImplementation((job, body, signal) => {
      const request = body as { action: string; media?: { kind: string } };
      if (request.action === "reserve" && request.media?.kind === "photo")
        return Promise.resolve({ asset: { skipped: true } });
      if (request.action === "reserve" && request.media?.kind === "poster")
        return Promise.resolve({ asset: { id: "poster", key: "existing.jpg", uploaded: true } });
      return original(job, body, signal);
    });
    expect(await processOne(client)).toEqual({ status: "complete", media: 1 });
    expect(makePoster).toHaveBeenCalledOnce();
  });
  it("does not publish a media result after revocation or parent interruption", async () => {
    const data = structuredClone(capture);
    data.media = data.tweet.media = [
      { id: "2000000000000000002", type: "PHOTO", url: "https://pbs.twimg.com/media/test.jpg" },
    ];
    vi.mocked(readPost).mockResolvedValue(data);
    vi.mocked(downloadMedia).mockRejectedValue(new ApiClientError(403, "revoked"));
    expect(await runOnce()).toMatchObject({ status: "failed" });
    vi.mocked(readPost).mockRejectedValue(new ConnectorError("needs_login"));
    expect(await runOnce()).toMatchObject({ error: "needs_login" });
    const controller = new AbortController();
    controller.abort();
    vi.mocked(readPost).mockRejectedValue(new Error("aborted"));
    expect(await runOnce(controller.signal)).toMatchObject({ error: "interrupted" });
  });
  it("shares login and only opens the saved target post, without importing X bookmarks", async () => {
    expect(await runOnce()).toEqual({ status: "complete", media: 0 });
    expect(getApiKey).toHaveBeenCalledOnce();
    expect(readPost).toHaveBeenCalledWith(postId, expect.any(AbortSignal));
    expect(
      requests.every(
        (r) => new Headers(r.init.headers).get("authorization") === "Bearer zhe_shared_cli_key",
      ),
    ).toBe(true);
    const actions = requests
      .filter((r) => typeof r.init.body === "string")
      .map((r) => JSON.parse(r.init.body as string).action)
      .filter(Boolean);
    expect(actions).toEqual(["capture", "capture", "complete"]);
    expect(JSON.stringify(requests)).not.toContain("cookies");
  });
  it("requires the existing zhe login and reacts to logout on the next poll", async () => {
    vi.mocked(getApiKey).mockReturnValue(undefined);
    await expect(runOnce()).rejects.toMatchObject({
      name: "ConnectorError",
      code: "missing_api_key",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does nothing when there is no saved work", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ job: null }));
    expect(await processOne(new ApiClient("zhe_test"))).toEqual({ status: "idle", media: 0 });
    expect(readPost).not.toHaveBeenCalled();
  });
  it("uploads streamed media using the same authenticated client", async () => {
    const data = structuredClone(capture);
    data.media = data.tweet.media = [
      {
        id: "2000000000000000002",
        type: "VIDEO",
        url: "https://video.twimg.com/ext_tw_video/2000000000000000002/pu/vid/1280x720/test.mp4",
      },
    ];
    vi.mocked(readPost).mockResolvedValue(data);
    const path = join(dir, "test.mp4");
    await writeFile(path, new Uint8Array(32));
    vi.mocked(downloadMedia).mockResolvedValue({
      path,
      size: 32,
      sha256: "a".repeat(64),
      mime: "video/mp4",
      width: 1280,
      height: 720,
      duration: 1,
    });
    expect(await runOnce()).toEqual({ status: "complete", media: 1 });
    const upload = requests.find((r) => r.init.method === "PUT");
    expect(upload?.init.body).toBeInstanceOf(Blob);
    expect(new Headers(upload?.init.headers).get("x-connector-lease")).toBe(job.leaseToken);
  });
  it("publishes text even when a media download fails", async () => {
    const data = structuredClone(capture);
    data.media = data.tweet.media = [
      {
        id: "2000000000000000002",
        type: "PHOTO",
        url: "https://pbs.twimg.com/media/synthetic.jpg",
      },
    ];
    vi.mocked(readPost).mockResolvedValue(data);
    vi.mocked(downloadMedia).mockRejectedValue(new ConnectorError("download_failed"));
    expect(await runOnce()).toEqual({ status: "partial", media: 0 });
    expect(requests.at(-1)?.init.body).toBe(JSON.stringify({ action: "complete" }));
  });
  it("sends a safe error code, never raw browser errors or private post data", async () => {
    vi.mocked(readPost).mockRejectedValue(new Error("private raw upstream response"));
    expect(await runOnce()).toEqual({ status: "failed", media: 0, error: "connector_error" });
    expect(requests.at(-1)?.init.body).toBe(
      JSON.stringify({ action: "fail", code: "connector_error" }),
    );
    expect(JSON.stringify(requests)).not.toContain("private raw");
  });
});
