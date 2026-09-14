import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../src/api/client.js";
import { ConnectorError } from "../src/connector/core.js";
import { ConnectorLogger, connectorErrorHint } from "../src/connector/log.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Connector progress output", () => {
  it.each([false, true])("shows permanent keys without an epoch date (json=%s)", (json) => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    new ConnectorLogger(json).queue({ states: [], keyPrefix: "private_prefix", expiresAt: null });
    const text = output.mock.calls.flat().join("\n");
    expect(text).toContain("key never expires");
    expect(text).not.toContain("1970");
    expect(text).not.toContain("private_prefix");
    if (json) expect(JSON.parse(String(output.mock.calls[0]?.[0])).expiresAt).toBeNull();
  });

  it("shows real byte progress, slow stages and accurate session totals in human-readable logs", () => {
    vi.useFakeTimers();
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = new ConnectorLogger();
    const status = {
      states: [
        { state: "pending", count: 3 },
        { state: "unavailable", count: 2 },
      ],
      keyPrefix: "zhe_private_prefix",
      expiresAt: Date.now() + 86400_000,
    };
    log.start();
    log.queue(status);
    log.queue(status);
    log.tick();
    log.progress({ stage: "claim", message: "Link #1" });
    log.progress({ stage: "read", message: "Reading saved post" });
    log.tick();
    vi.advanceTimersByTime(10_000);
    log.tick();
    log.progress({ stage: "capture", message: "Text saved", total: 2 });
    log.progress({ stage: "download", message: "PHOTO 1/2", received: 512, bytes: 1024 });
    log.progress({ stage: "download", message: "PHOTO 1/2", received: 1024, bytes: 1024 });
    log.progress({ stage: "verify", message: "Verifying media", bytes: 1024 });
    log.progress({ stage: "uploaded", message: "Upload confirmed", bytes: 1024 });
    log.progress({ stage: "skipped", message: "Explicit deletion retained" });
    log.progress({ stage: "warning", message: "Another media item could not be saved" });
    log.result({ status: "partial", media: 1 }, 12_000, true);
    log.progress({ stage: "claim", message: "Link #2" });
    log.result({ status: "failed", media: 0, error: "needs_login" }, 1000, true);
    log.result({ status: "failed", media: 0, error: "interrupted" }, 500);
    log.result({ status: "idle", media: 0 }, 100);
    log.offline(new ApiClientError(403, "private server response"));
    log.offline(new Error("private network response"));
    log.stop();
    const text = output.mock.calls.flat().join("\n");
    expect(output.mock.calls.filter(([line]) => String(line).includes("QUEUE"))).toHaveLength(1);
    expect(text).toContain("3 pending");
    expect(text).toContain("2 unavailable");
    expect(text).toContain("50% · 512 B / 1.0 KB");
    expect(text).toContain("100% · 1.0 KB / 1.0 KB");
    expect(text).toContain("still running");
    expect(text).toContain("1/2 media archived");
    expect(text).toContain("connector:write");
    expect(text).toContain(
      "0 complete · 1 partial · 1 failed · 1 interrupted · 1 media · 1 skipped · 1.0 KB uploaded · 2 connection errors",
    );
    expect(text).not.toContain("private");
  });

  it.each([
    [new ApiClientError(401, "private auth detail"), "API Key"],
    [new ConnectorError("needs_login"), "sign in to X"],
    [new ConnectorError("unknown_private_code"), "Connector processing failed"],
    [new Error("private upstream detail"), "Connector processing failed"],
    ["__proto__", "Connector processing failed"],
    [undefined, "Connector processing failed"],
  ])("only exposes safe, actionable error hints for %s", (error, expected) => {
    expect(connectorErrorHint(error)).toContain(expected as string);
    expect(connectorErrorHint(error)).not.toContain("private");
  });
});
