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
    // Clone the request so we can read the body for logging
    // while still passing the original to the SDK
    const cloned = request.clone();
    const rawBody = await cloned.text();
    console.log("[webhook] Incoming POST body:", rawBody.slice(0, 500));

    const bot = await getBotFromDB();
    if (!bot) {
      console.log("[webhook] No bot configured in DB");
      return NextResponse.json(
        { error: "Discord bot not configured" },
        { status: 503 },
      );
    }

    // Initialize bot before processing — registers handlers with adapters
    console.log("[webhook] Initializing bot...");
    await bot.initialize();
    console.log("[webhook] Bot initialized, calling bot.webhooks.discord()...");

    const response = await bot.webhooks.discord(request, {
      waitUntil: (p) => after(() => p),
    });

    console.log("[webhook] bot.webhooks.discord() returned status:", response.status);
    return response;
  } catch (error) {
    console.error("Discord webhook error:", error);
    return NextResponse.json(
      { error: "Discord webhook processing failed" },
      { status: 500 },
    );
  }
}
