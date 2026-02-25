import { NextResponse } from "next/server";
import { after } from "next/server";
import { getBotFromDB, getDiscordAdapter } from "@/lib/bot";

/** Gateway listener duration: 9 minutes (540,000ms).
 *  Cron fires every 9 minutes so listeners overlap briefly, ensuring no gaps. */
const GATEWAY_DURATION_MS = 540_000;

/**
 * GET /api/discord/gateway
 *
 * Starts a Discord Gateway WebSocket listener that forwards message events
 * to the webhook endpoint. Designed to be called by a Vercel cron job every
 * 9 minutes to maintain a persistent connection in a serverless environment.
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

    // 5. Start gateway listener
    const adapter = getDiscordAdapter(bot);
    return await adapter.startGatewayListener(
      { waitUntil: (p: Promise<unknown>) => after(() => p) },
      GATEWAY_DURATION_MS,
      undefined,
      webhookUrl,
    );
  } catch (error) {
    console.error("Discord gateway error:", error);
    return NextResponse.json(
      { error: "Discord gateway failed to start" },
      { status: 500 },
    );
  }
}
