import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearMockStorage } from '../setup';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserId = 'user-bot-123';
vi.mock('@/auth', () => ({
  auth: vi.fn(() =>
    Promise.resolve({ user: { id: mockUserId, name: 'Test' } }),
  ),
}));

// Mock ScopedDB
const mockGetDiscordBotSettings = vi.fn();
const mockUpsertDiscordBotSettings = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getDiscordBotSettings: mockGetDiscordBotSettings,
    upsertDiscordBotSettings: mockUpsertDiscordBotSettings,
  })),
}));

import {
  getDiscordBotConfig,
  saveDiscordBotConfig,
} from '@/actions/bot';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const validToken = 'FAKE_ID.FAKE_TS.FAKE_HMAC_FOR_TESTING';
const validPublicKey = 'a'.repeat(64);
const validAppId = '123456789012345678';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bot actions', () => {
  beforeEach(() => {
    clearMockStorage();
    vi.clearAllMocks();
  });

  // ==================================================================
  // getDiscordBotConfig
  // ==================================================================
  describe('getDiscordBotConfig', () => {
    it('returns config with masked secrets when configured', async () => {
      mockGetDiscordBotSettings.mockResolvedValue({
        botToken: validToken,
        publicKey: validPublicKey,
        applicationId: validAppId,
      });

      const result = await getDiscordBotConfig();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Bot token should be masked
      expect(result.data!.maskedBotToken).toContain('•');
      expect(result.data!.maskedBotToken).not.toBe(validToken);
      // Public key should be masked
      expect(result.data!.maskedPublicKey).toContain('•');
      expect(result.data!.maskedPublicKey).not.toBe(validPublicKey);
      // Application ID is NOT secret — shown in full
      expect(result.data!.applicationId).toBe(validAppId);
    });

    it('returns undefined data when not configured', async () => {
      mockGetDiscordBotSettings.mockResolvedValue(null);

      const result = await getDiscordBotConfig();
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('returns error when auth fails', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await getDiscordBotConfig();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when DB throws', async () => {
      mockGetDiscordBotSettings.mockRejectedValue(new Error('DB error'));

      const result = await getDiscordBotConfig();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to load Discord bot config');
    });
  });

  // ==================================================================
  // saveDiscordBotConfig
  // ==================================================================
  describe('saveDiscordBotConfig', () => {
    it('saves valid config and returns masked secrets', async () => {
      mockUpsertDiscordBotSettings.mockResolvedValue({
        userId: mockUserId,
        previewStyle: 'favicon',
        discordBotToken: validToken,
        discordPublicKey: validPublicKey,
        discordApplicationId: validAppId,
      });

      const result = await saveDiscordBotConfig({
        botToken: validToken,
        publicKey: validPublicKey,
        applicationId: validAppId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.maskedBotToken).toContain('•');
      expect(result.data!.applicationId).toBe(validAppId);
      expect(mockUpsertDiscordBotSettings).toHaveBeenCalledWith({
        botToken: validToken,
        publicKey: validPublicKey,
        applicationId: validAppId,
      });
    });

    it('rejects invalid bot token (no dots)', async () => {
      const result = await saveDiscordBotConfig({
        botToken: 'invalid-no-dots',
        publicKey: validPublicKey,
        applicationId: validAppId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bot Token');
      expect(mockUpsertDiscordBotSettings).not.toHaveBeenCalled();
    });

    it('rejects invalid public key', async () => {
      const result = await saveDiscordBotConfig({
        botToken: validToken,
        publicKey: 'too-short',
        applicationId: validAppId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Public Key');
      expect(mockUpsertDiscordBotSettings).not.toHaveBeenCalled();
    });

    it('rejects non-numeric application ID', async () => {
      const result = await saveDiscordBotConfig({
        botToken: validToken,
        publicKey: validPublicKey,
        applicationId: 'not-numeric',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Application ID');
      expect(mockUpsertDiscordBotSettings).not.toHaveBeenCalled();
    });

    it('rejects empty config', async () => {
      const result = await saveDiscordBotConfig({
        botToken: '',
        publicKey: '',
        applicationId: '',
      });

      expect(result.success).toBe(false);
    });

    it('trims whitespace from inputs', async () => {
      mockUpsertDiscordBotSettings.mockResolvedValue({
        userId: mockUserId,
        previewStyle: 'favicon',
        discordBotToken: validToken,
        discordPublicKey: validPublicKey,
        discordApplicationId: validAppId,
      });

      await saveDiscordBotConfig({
        botToken: `  ${validToken}  `,
        publicKey: `  ${validPublicKey}  `,
        applicationId: `  ${validAppId}  `,
      });

      expect(mockUpsertDiscordBotSettings).toHaveBeenCalledWith({
        botToken: validToken,
        publicKey: validPublicKey,
        applicationId: validAppId,
      });
    });

    it('returns error when auth fails', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await saveDiscordBotConfig({
        botToken: validToken,
        publicKey: validPublicKey,
        applicationId: validAppId,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when DB throws', async () => {
      mockUpsertDiscordBotSettings.mockRejectedValue(new Error('DB error'));

      const result = await saveDiscordBotConfig({
        botToken: validToken,
        publicKey: validPublicKey,
        applicationId: validAppId,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to save Discord bot config');
    });
  });
});
