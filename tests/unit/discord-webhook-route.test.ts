import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lib/bot
const mockGetBotFromDB = vi.fn();
vi.mock("@/lib/bot", () => ({
  getBotFromDB: (...args: unknown[]) => mockGetBotFromDB(...args),
}));

import { POST } from "@/app/api/webhooks/discord/route";

function makeRequest(body?: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/webhooks/discord", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/webhooks/discord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when no bot is configured in DB", async () => {
    mockGetBotFromDB.mockResolvedValue(null);

    const res = await POST(makeRequest({ type: 1 }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain("not configured");
  });

  it("delegates to bot.webhooks.discord when bot is configured", async () => {
    const mockDiscordWebhook = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: 1 }), { status: 200 }),
    );
    const mockBot = {
      initialize: vi.fn().mockResolvedValue(undefined),
      webhooks: {
        discord: mockDiscordWebhook,
      },
    };
    mockGetBotFromDB.mockResolvedValue(mockBot);

    const req = makeRequest({ type: 1 });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockBot.initialize).toHaveBeenCalledTimes(1);
    expect(mockDiscordWebhook).toHaveBeenCalledTimes(1);
    // First arg should be the request
    expect(mockDiscordWebhook.mock.calls[0][0]).toBeInstanceOf(Request);
    // Second arg should have waitUntil
    expect(mockDiscordWebhook.mock.calls[0][1]).toHaveProperty("waitUntil");
  });

  it("passes a waitUntil function in options", async () => {
    const mockDiscordWebhook = vi.fn().mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const mockBot = {
      initialize: vi.fn().mockResolvedValue(undefined),
      webhooks: {
        discord: mockDiscordWebhook,
      },
    };
    mockGetBotFromDB.mockResolvedValue(mockBot);

    await POST(makeRequest({ type: 1 }));

    const options = mockDiscordWebhook.mock.calls[0][1];
    expect(typeof options.waitUntil).toBe("function");
  });

  it("returns 500 when bot.webhooks.discord throws", async () => {
    const mockDiscordWebhook = vi.fn().mockRejectedValue(
      new Error("Discord SDK error"),
    );
    const mockBot = {
      initialize: vi.fn().mockResolvedValue(undefined),
      webhooks: {
        discord: mockDiscordWebhook,
      },
    };
    mockGetBotFromDB.mockResolvedValue(mockBot);

    const res = await POST(makeRequest({ type: 1 }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("webhook");
  });

  it("returns 500 when getBotFromDB throws", async () => {
    mockGetBotFromDB.mockRejectedValue(new Error("DB connection failed"));

    const res = await POST(makeRequest({ type: 1 }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});
