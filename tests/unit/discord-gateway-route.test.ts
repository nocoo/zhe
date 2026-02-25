import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lib/bot
const mockGetBotFromDB = vi.fn();
const mockGetDiscordAdapter = vi.fn();
vi.mock("@/lib/bot", () => ({
  getBotFromDB: (...args: unknown[]) => mockGetBotFromDB(...args),
  getDiscordAdapter: (...args: unknown[]) => mockGetDiscordAdapter(...args),
}));

import { GET } from "@/app/api/discord/gateway/route";

const VALID_SECRET = "test-cron-secret-123";

function makeRequest(
  headers?: Record<string, string>,
): Request {
  return new Request("http://localhost/api/discord/gateway", {
    method: "GET",
    headers: {
      ...headers,
    },
  });
}

function makeAuthedRequest(
  secret: string = VALID_SECRET,
): Request {
  return makeRequest({ Authorization: `Bearer ${secret}` });
}

describe("GET /api/discord/gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", VALID_SECRET);
  });

  it("returns 401 when no Authorization header", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("Unauthorized");
  });

  it("returns 401 when Authorization header has wrong format", async () => {
    const res = await GET(makeRequest({ Authorization: "Basic abc123" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("Unauthorized");
  });

  it("returns 401 when Bearer token does not match CRON_SECRET", async () => {
    const res = await GET(makeAuthedRequest("wrong-secret"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("Unauthorized");
  });

  it("returns 401 when CRON_SECRET env var is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await GET(makeAuthedRequest("some-token"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("Unauthorized");
  });

  it("returns 503 when no bot is configured in DB", async () => {
    mockGetBotFromDB.mockResolvedValue(null);

    const res = await GET(makeAuthedRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain("not configured");
  });

  it("initializes bot, gets adapter, and starts gateway listener", async () => {
    const mockStartGatewayListener = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "listening" }), { status: 200 }),
    );
    const mockAdapter = {
      startGatewayListener: mockStartGatewayListener,
    };
    const mockBot = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };
    mockGetBotFromDB.mockResolvedValue(mockBot);
    mockGetDiscordAdapter.mockReturnValue(mockAdapter);

    const res = await GET(makeAuthedRequest());

    expect(res.status).toBe(200);
    expect(mockBot.initialize).toHaveBeenCalledTimes(1);
    expect(mockGetDiscordAdapter).toHaveBeenCalledWith(mockBot);
    expect(mockStartGatewayListener).toHaveBeenCalledTimes(1);
  });

  it("passes correct durationMs to startGatewayListener", async () => {
    const mockStartGatewayListener = vi.fn().mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const mockAdapter = {
      startGatewayListener: mockStartGatewayListener,
    };
    const mockBot = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };
    mockGetBotFromDB.mockResolvedValue(mockBot);
    mockGetDiscordAdapter.mockReturnValue(mockAdapter);

    await GET(makeAuthedRequest());

    const args = mockStartGatewayListener.mock.calls[0];
    // args[0] = options (with waitUntil)
    expect(args[0]).toHaveProperty("waitUntil");
    // args[1] = durationMs (540000 = 9 minutes)
    expect(args[1]).toBe(540_000);
    // args[2] = abortSignal (undefined)
    expect(args[2]).toBeUndefined();
    // args[3] = webhookUrl (should contain /api/webhooks/discord)
    expect(args[3]).toContain("/api/webhooks/discord");
  });

  it("constructs webhookUrl from BASE_URL env var when available", async () => {
    vi.stubEnv("BASE_URL", "https://zhe.example.com");
    const mockStartGatewayListener = vi.fn().mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const mockAdapter = { startGatewayListener: mockStartGatewayListener };
    const mockBot = { initialize: vi.fn().mockResolvedValue(undefined) };
    mockGetBotFromDB.mockResolvedValue(mockBot);
    mockGetDiscordAdapter.mockReturnValue(mockAdapter);

    await GET(makeAuthedRequest());

    const webhookUrl = mockStartGatewayListener.mock.calls[0][3];
    expect(webhookUrl).toBe("https://zhe.example.com/api/webhooks/discord");
  });

  it("falls back to request origin for webhookUrl when BASE_URL not set", async () => {
    vi.stubEnv("BASE_URL", "");
    const mockStartGatewayListener = vi.fn().mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const mockAdapter = { startGatewayListener: mockStartGatewayListener };
    const mockBot = { initialize: vi.fn().mockResolvedValue(undefined) };
    mockGetBotFromDB.mockResolvedValue(mockBot);
    mockGetDiscordAdapter.mockReturnValue(mockAdapter);

    await GET(makeAuthedRequest());

    const webhookUrl = mockStartGatewayListener.mock.calls[0][3];
    expect(webhookUrl).toBe("http://localhost/api/webhooks/discord");
  });

  it("returns 500 when bot.initialize throws", async () => {
    const mockBot = {
      initialize: vi.fn().mockRejectedValue(new Error("Init failed")),
    };
    mockGetBotFromDB.mockResolvedValue(mockBot);

    const res = await GET(makeAuthedRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 500 when startGatewayListener throws", async () => {
    const mockStartGatewayListener = vi.fn().mockRejectedValue(
      new Error("Gateway connection failed"),
    );
    const mockAdapter = { startGatewayListener: mockStartGatewayListener };
    const mockBot = { initialize: vi.fn().mockResolvedValue(undefined) };
    mockGetBotFromDB.mockResolvedValue(mockBot);
    mockGetDiscordAdapter.mockReturnValue(mockAdapter);

    const res = await GET(makeAuthedRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});
