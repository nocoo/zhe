import { Chat } from "chat";
import { createDiscordAdapter, DiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";
import { getDiscordBotConfig } from "@/lib/db";

export interface BotConfig {
  botToken: string;
  publicKey: string;
  applicationId: string;
}

/**
 * Create a Chat SDK instance configured with the Discord adapter.
 * Uses in-memory state (acceptable for single-user, serverless).
 */
export function createBot(config: BotConfig): Chat {
  const bot = new Chat({
    userName: "zhe-bot",
    adapters: {
      discord: createDiscordAdapter({
        botToken: config.botToken,
        publicKey: config.publicKey,
        applicationId: config.applicationId,
      }),
    },
    state: createMemoryState(),
  });

  // Phase 1: echo handler — reply with the received message text
  bot.onNewMention(async (thread, message) => {
    const text = message.text || "(empty message)";
    await thread.post(`Echo: ${text}`);
  });

  return bot;
}

/**
 * Get a bot instance by reading config from the database.
 * Returns null if no Discord bot is configured.
 */
export async function getBotFromDB(): Promise<Chat | null> {
  const config = await getDiscordBotConfig();
  if (!config) return null;
  return createBot(config);
}

/**
 * Get the Discord adapter from a bot instance.
 */
export function getDiscordAdapter(bot: Chat): DiscordAdapter {
  return bot.getAdapter("discord") as DiscordAdapter;
}
