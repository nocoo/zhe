import { timingSafeEqual } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleD1Batch, handleD1Query } from "../src/d1-proxy";
import type { Env } from "../src/types";

Object.defineProperty(crypto.subtle, "timingSafeEqual", {
  value: timingSafeEqual,
  configurable: true,
});

const result = (results: unknown[] = [], changes = 0) => ({
  success: true,
  results,
  meta: { changes, last_row_id: 0 },
});
const request = (body: unknown, token = "secret") =>
  new Request("https://worker.test/api/d1-query", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

function fixture() {
  const values = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string, type?: string) => {
      const value = values.get(key);
      return value === undefined ? null : type === "json" ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
  const all = vi.fn(async () => result());
  const statement = { bind: vi.fn().mockReturnThis(), all };
  const db = { prepare: vi.fn(() => statement), batch: vi.fn(async () => [result([], 1)]) };
  const env = { LINKS_KV: kv, DB: db, D1_PROXY_SECRET: "secret" } as unknown as Env;
  const read = (userId = "owner", key = "readiness") =>
    handleD1Query(
      request({
        sql: "SELECT state FROM jobs WHERE user_id=?",
        params: [userId],
        connectorUserId: userId,
        connectorCache: { key },
      }),
      env,
    );
  const write = () =>
    handleD1Query(
      request({
        sql: "INSERT INTO links(user_id) VALUES(?)",
        params: ["owner"],
        connectorUserId: "owner",
      }),
      env,
    );
  return { values, kv, all, db, env, read, write };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Connector Worker cache", () => {
  it("serves repeated empty polls and statistics from KV, then wakes on a new link", async () => {
    const f = fixture();
    await f.read();
    await f.read("owner", "states");
    f.all.mockClear();
    for (let poll = 0; poll < 15; poll++) {
      expect(await (await f.read()).json()).toMatchObject({ success: true, results: [] });
      await f.read("owner", "states");
    }
    expect(f.all).not.toHaveBeenCalled();

    f.all.mockResolvedValueOnce(result([], 1));
    await f.write();
    f.all.mockResolvedValue(result([{ state: "pending" }]));
    expect(await (await f.read()).json()).toMatchObject({ results: [{ state: "pending" }] });
    await f.read("owner", "states");
    expect(f.all).toHaveBeenCalledTimes(3);
  });

  it("isolates tenants and periodically refreshes even when KV returns expired values", async () => {
    const f = fixture();
    await f.read();
    await f.read("other");
    expect(f.all).toHaveBeenCalledTimes(2);
    vi.mocked(Date.now).mockReturnValue(1_300_000);
    await f.read();
    expect(f.all).toHaveBeenCalledTimes(3);
  });

  it("authenticates even a cached request, and leaves unmarked queries uncached", async () => {
    const f = fixture();
    await f.read();
    const unauthorized = await handleD1Query(
      request(
        {
          sql: "SELECT state FROM jobs WHERE user_id=?",
          connectorUserId: "owner",
          connectorCache: { key: "readiness" },
        },
        "invalid",
      ),
      f.env,
    );
    expect(unauthorized.status).toBe(401);
    expect(f.all).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 2; i++) await handleD1Query(request({ sql: "SELECT 1" }), f.env);
    expect(f.all).toHaveBeenCalledTimes(3);
  });

  it("invalidates after successful atomic batches, but not failed or no-op writes", async () => {
    const f = fixture();
    await f.read();
    await f.write();
    await f.read();
    expect(f.all).toHaveBeenCalledTimes(2);
    await handleD1Batch(
      request({
        statements: [{ sql: "UPDATE jobs SET state='complete'" }],
        connectorUserId: "owner",
      }),
      f.env,
    );
    await f.read();
    expect(f.all).toHaveBeenCalledTimes(3);
    f.all.mockRejectedValueOnce(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await (await f.write()).json()).toMatchObject({ success: false });
    await f.read();
    expect(f.all).toHaveBeenCalledTimes(4);
  });

  it("does not let an old in-flight cache fill hide newly created work", async () => {
    const f = fixture();
    let finish: (value: ReturnType<typeof result>) => void = () => {};
    f.all.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = f.read();
    await vi.waitFor(() => expect(f.all).toHaveBeenCalledTimes(1));
    f.all.mockResolvedValueOnce(result([], 1));
    await f.write();
    finish(result());
    await pending;
    f.all.mockResolvedValueOnce(result([{ state: "pending" }]));
    expect(await (await f.read()).json()).toMatchObject({ results: [{ state: "pending" }] });
  });

  it.each(["get", "put"] as const)(
    "falls back to D1 on KV %s failure without failing saved links",
    async (method) => {
      const f = fixture();
      vi.spyOn(console, "error").mockImplementation(() => {});
      f.kv[method].mockRejectedValue(new Error("KV unavailable"));
      expect(await (await f.read()).json()).toMatchObject({ success: true });
      f.all.mockResolvedValueOnce(result([], 1));
      expect(await (await f.write()).json()).toMatchObject({ success: true });
    },
  );

  it("writes presence only once per minute and independently for each API key", async () => {
    const f = fixture();
    const heartbeat = (key: string) =>
      handleD1Query(
        request({
          sql: "INSERT INTO x_connector_presence VALUES(?,?,?)",
          params: [key, "owner", Date.now()],
          connectorUserId: "owner",
          connectorCache: { key: `presence:${key}`, ttl: 60 },
        }),
        f.env,
      );
    await heartbeat("key1");
    await heartbeat("key1");
    await heartbeat("key2");
    expect(f.all).toHaveBeenCalledTimes(2);
    vi.mocked(Date.now).mockReturnValue(1_060_000);
    await heartbeat("key1");
    expect(f.all).toHaveBeenCalledTimes(3);
  });
});
