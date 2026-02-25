import { NextResponse } from "next/server";
import { getBotFromDB, getDiscordAdapter } from "@/lib/bot";

/** Gateway listener duration: 9 minutes (540,000ms).
 *  Cron fires every 9 minutes so listeners overlap briefly, ensuring no gaps. */
const GATEWAY_DURATION_MS = 540_000;

/**
 * GET /api/discord/gateway
 *
 * Starts a Discord Gateway WebSocket listener that forwards message events
 * to the webhook endpoint. Called by a cron job every 9 minutes.
 *
 * On Railway (persistent process), we capture the listener promise from the
 * SDK's waitUntil callback and await it directly, keeping the HTTP request
 * alive for the full 9 minutes. This avoids relying on Next.js `after()`
 * which cannot sustain long-running background tasks in standalone mode.
 *
 * Protected by CRON_SECRET Bearer token.
 */
export async function GET(request: Request): Promise<Response> {
  // 1. Authenticate via CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!cronSecret || !token || token !== cronSecret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    // 2. Get bot from DB
    const bot = await getBotFromDB();
    if (!bot) {
      return NextResponse.json(
        { error: "Discord bot not configured" },
        { status: 503 },
      );
    }

    // 3. Initialize bot (required before getAdapter)
    await bot.initialize();

    // 4. Resolve webhook URL for gateway event forwarding
    const baseUrl = process.env.BASE_URL || new URL(request.url).origin;
    const webhookUrl = `${baseUrl}/api/webhooks/discord`;

    // 5. Capture the listener promise from SDK's waitUntil callback
    let listenerPromise: Promise<unknown> | undefined;
    const adapter = getDiscordAdapter(bot);
    const response = await adapter.startGatewayListener(
      { waitUntil: (p: Promise<unknown>) => { listenerPromise = p; } },
      GATEWAY_DURATION_MS,
      undefined,
      webhookUrl,
    );

    // 6. Await the listener promise directly — keeps the request alive
    //    for the full 9 minutes so the WebSocket stays connected
    if (listenerPromise) {
      console.log("[gateway] Awaiting listener promise (9 min)...");
      await listenerPromise;
      console.log("[gateway] Listener promise resolved, WebSocket closed");
    }

    return response;
  } catch (error) {
    console.error("Discord gateway error:", error);
    return NextResponse.json(
      { error: "Discord gateway failed to start" },
      { status: 500 },
    );
  }
}
