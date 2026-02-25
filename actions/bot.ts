'use server';

import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';
import {
  validateDiscordBotConfig,
  maskSecret,
} from '@/models/bot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getScopedDB(): Promise<ScopedDB | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return new ScopedDB(userId);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Get the current Discord bot config (with secrets masked). */
export async function getDiscordBotConfig(): Promise<{
  success: boolean;
  data?: {
    maskedBotToken: string;
    maskedPublicKey: string;
    applicationId: string;
  };
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const config = await db.getDiscordBotSettings();
    if (!config) return { success: true, data: undefined };

    return {
      success: true,
      data: {
        maskedBotToken: maskSecret(config.botToken),
        maskedPublicKey: maskSecret(config.publicKey),
        applicationId: config.applicationId,
      },
    };
  } catch (error) {
    console.error('Failed to get Discord bot config:', error);
    return { success: false, error: 'Failed to load Discord bot config' };
  }
}

/** Save Discord bot config (token + public key + application ID). */
export async function saveDiscordBotConfig(config: {
  botToken: string;
  publicKey: string;
  applicationId: string;
}): Promise<{
  success: boolean;
  data?: {
    maskedBotToken: string;
    maskedPublicKey: string;
    applicationId: string;
  };
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const trimmed = {
      botToken: config.botToken.trim(),
      publicKey: config.publicKey.trim(),
      applicationId: config.applicationId.trim(),
    };

    const validation = validateDiscordBotConfig(trimmed);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    await db.upsertDiscordBotSettings(trimmed);

    return {
      success: true,
      data: {
        maskedBotToken: maskSecret(trimmed.botToken),
        maskedPublicKey: maskSecret(trimmed.publicKey),
        applicationId: trimmed.applicationId,
      },
    };
  } catch (error) {
    console.error('Failed to save Discord bot config:', error);
    return { success: false, error: 'Failed to save Discord bot config' };
  }
}
