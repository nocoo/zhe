import { NextResponse } from "next/server";
import { after } from "next/server";
import { getBotFromDB } from "@/lib/bot";

/**
 * POST /api/webhooks/discord
 *
 * Discord interaction webhook endpoint.
 * Handles Discord's Ed25519 signature verification (via Chat SDK),
 * interaction pings, button clicks, slash commands, and gateway-forwarded messages.
 *
 * The bot config (token, public key, application ID) is read from the database.
 * Returns 503 if no bot is configured.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const bot = await getBotFromDB();
    if (!bot) {
      return NextResponse.json(
        { error: "Discord bot not configured" },
        { status: 503 },
      );
    }

    return await bot.webhooks.discord(request, {
      waitUntil: (p) => after(() => p),
    });
  } catch (error) {
    console.error("Discord webhook error:", error);
    return NextResponse.json(
      { error: "Discord webhook processing failed" },
      { status: 500 },
    );
  }
}
