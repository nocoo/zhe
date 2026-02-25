import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Chat } from 'chat';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateDiscordAdapter = vi.fn().mockReturnValue({ name: 'discord' });
const mockCreateMemoryState = vi.fn().mockReturnValue({});
const mockGetDiscordBotConfig = vi.fn();

vi.mock('@chat-adapter/discord', () => ({
  createDiscordAdapter: (...args: unknown[]) => mockCreateDiscordAdapter(...args),
}));

vi.mock('@chat-adapter/state-memory', () => ({
  createMemoryState: (...args: unknown[]) => mockCreateMemoryState(...args),
}));

// Mock the Chat constructor
const mockOnNewMention = vi.fn();
const mockGetAdapter = vi.fn();
const mockWebhooks = { discord: vi.fn() };

vi.mock('chat', () => ({
  Chat: vi.fn().mockImplementation(() => ({
    onNewMention: mockOnNewMention,
    getAdapter: mockGetAdapter,
    webhooks: mockWebhooks,
  })),
}));

vi.mock('@/lib/db', () => ({
  getDiscordBotConfig: (...args: unknown[]) => mockGetDiscordBotConfig(...args),
}));

import { createBot, getBotFromDB, getDiscordAdapter } from '@/lib/bot';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lib/bot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBot', () => {
    it('creates a Chat instance with discord adapter and memory state', () => {
      const config = {
        botToken: 'test-token',
        publicKey: 'test-key',
        applicationId: 'test-app-id',
      };

      createBot(config);

      expect(mockCreateDiscordAdapter).toHaveBeenCalledWith({
        botToken: 'test-token',
        publicKey: 'test-key',
        applicationId: 'test-app-id',
      });
      expect(mockCreateMemoryState).toHaveBeenCalled();
    });

    it('registers an onNewMention handler', () => {
      const config = {
        botToken: 'test-token',
        publicKey: 'test-key',
        applicationId: 'test-app-id',
      };

      createBot(config);

      expect(mockOnNewMention).toHaveBeenCalledWith(expect.any(Function));
    });

    it('echo handler posts Echo: <text>', async () => {
      const config = {
        botToken: 'test-token',
        publicKey: 'test-key',
        applicationId: 'test-app-id',
      };

      createBot(config);

      // Extract the handler
      const handler = mockOnNewMention.mock.calls[0][0];
      const mockThread = { post: vi.fn() };
      const mockMessage = { text: 'hello world' };

      await handler(mockThread, mockMessage);

      expect(mockThread.post).toHaveBeenCalledWith('Echo: hello world');
    });

    it('echo handler handles empty text', async () => {
      const config = {
        botToken: 'test-token',
        publicKey: 'test-key',
        applicationId: 'test-app-id',
      };

      createBot(config);

      const handler = mockOnNewMention.mock.calls[0][0];
      const mockThread = { post: vi.fn() };
      const mockMessage = { text: '' };

      await handler(mockThread, mockMessage);

      expect(mockThread.post).toHaveBeenCalledWith('Echo: (empty message)');
    });
  });

  describe('getBotFromDB', () => {
    it('returns null when no config is in DB', async () => {
      mockGetDiscordBotConfig.mockResolvedValue(null);

      const result = await getBotFromDB();

      expect(result).toBeNull();
    });

    it('returns a bot instance when config exists', async () => {
      mockGetDiscordBotConfig.mockResolvedValue({
        userId: 'user-1',
        botToken: 'db-token',
        publicKey: 'db-key',
        applicationId: 'db-app-id',
      });

      const result = await getBotFromDB();

      expect(result).not.toBeNull();
      expect(mockCreateDiscordAdapter).toHaveBeenCalledWith({
        botToken: 'db-token',
        publicKey: 'db-key',
        applicationId: 'db-app-id',
      });
    });
  });

  describe('getDiscordAdapter', () => {
    it('calls bot.getAdapter with "discord"', () => {
      const mockBot = { getAdapter: vi.fn().mockReturnValue({ name: 'discord' }) } as unknown as Chat;

      const adapter = getDiscordAdapter(mockBot);

      expect(mockBot.getAdapter).toHaveBeenCalledWith('discord');
      expect(adapter).toEqual({ name: 'discord' });
    });
  });
});
