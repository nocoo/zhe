import { describe, it, expect } from 'vitest';
import {
  validateDiscordBotConfig,
  isValidBotToken,
  isValidPublicKey,
  isValidApplicationId,
  maskSecret,
} from '@/models/bot';

describe('bot model', () => {
  // ==================================================================
  // isValidBotToken
  // ==================================================================
  describe('isValidBotToken', () => {
    it('accepts a realistic bot token format', () => {
      // Discord bot tokens are base64-ish: {id}.{timestamp}.{hmac}
      expect(isValidBotToken('FAKE_ID.FAKE_TS.FAKE_HMAC_FOR_TESTING')).toBe(true);
    });

    it('accepts a minimal token with dot separators', () => {
      expect(isValidBotToken('abc.def.ghijklmnop')).toBe(true);
    });

    it('rejects empty string', () => {
      expect(isValidBotToken('')).toBe(false);
    });

    it('rejects whitespace-only string', () => {
      expect(isValidBotToken('   ')).toBe(false);
    });

    it('rejects token without dots (no segments)', () => {
      expect(isValidBotToken('nodots')).toBe(false);
    });

    it('rejects token with only one dot (two segments)', () => {
      expect(isValidBotToken('only.twosegments')).toBe(false);
    });

    it('accepts token with extra dots (more than 3 segments)', () => {
      // Some token formats may have extra dots; be permissive
      expect(isValidBotToken('a.b.c.d')).toBe(true);
    });
  });

  // ==================================================================
  // isValidPublicKey
  // ==================================================================
  describe('isValidPublicKey', () => {
    it('accepts a 64-char hex string', () => {
      const key = 'a'.repeat(64);
      expect(isValidPublicKey(key)).toBe(true);
    });

    it('accepts uppercase hex chars', () => {
      const key = 'ABCDEF0123456789'.repeat(4);
      expect(isValidPublicKey(key)).toBe(true);
    });

    it('accepts mixed case hex', () => {
      const key = 'aAbBcCdDeEfF0123456789012345678901234567890123456789012345678901';
      expect(isValidPublicKey(key)).toBe(true);
    });

    it('rejects empty string', () => {
      expect(isValidPublicKey('')).toBe(false);
    });

    it('rejects non-hex characters', () => {
      const key = 'g'.repeat(64);
      expect(isValidPublicKey(key)).toBe(false);
    });

    it('rejects key shorter than 64 chars', () => {
      const key = 'a'.repeat(63);
      expect(isValidPublicKey(key)).toBe(false);
    });

    it('rejects key longer than 64 chars', () => {
      const key = 'a'.repeat(65);
      expect(isValidPublicKey(key)).toBe(false);
    });
  });

  // ==================================================================
  // isValidApplicationId
  // ==================================================================
  describe('isValidApplicationId', () => {
    it('accepts a numeric string (snowflake)', () => {
      expect(isValidApplicationId('123456789012345678')).toBe(true);
    });

    it('accepts short numeric IDs', () => {
      expect(isValidApplicationId('12345')).toBe(true);
    });

    it('rejects empty string', () => {
      expect(isValidApplicationId('')).toBe(false);
    });

    it('rejects non-numeric characters', () => {
      expect(isValidApplicationId('123abc')).toBe(false);
    });

    it('rejects whitespace-only', () => {
      expect(isValidApplicationId('  ')).toBe(false);
    });

    it('rejects string with spaces around digits', () => {
      expect(isValidApplicationId(' 123 ')).toBe(false);
    });
  });

  // ==================================================================
  // maskSecret
  // ==================================================================
  describe('maskSecret', () => {
    it('masks secrets >= 10 chars showing first 4 and last 4', () => {
      expect(maskSecret('1234567890abcdef')).toBe('1234••••••••cdef');
    });

    it('fully masks secrets < 10 chars', () => {
      expect(maskSecret('short')).toBe('•••••');
    });

    it('handles exactly 10 chars', () => {
      expect(maskSecret('1234567890')).toBe('1234••7890');
    });

    it('handles empty string', () => {
      expect(maskSecret('')).toBe('');
    });

    it('handles 9-char secret (fully masked)', () => {
      expect(maskSecret('123456789')).toBe('•••••••••');
    });
  });

  // ==================================================================
  // validateDiscordBotConfig
  // ==================================================================
  describe('validateDiscordBotConfig', () => {
    const validConfig = {
      botToken: 'FAKE_ID.FAKE_TS.FAKE_HMAC_FOR_TESTING',
      publicKey: 'a'.repeat(64),
      applicationId: '123456789012345678',
    };

    it('accepts a fully valid config', () => {
      const result = validateDiscordBotConfig(validConfig);
      expect(result.valid).toBe(true);
    });

    it('rejects missing botToken', () => {
      const result = validateDiscordBotConfig({
        publicKey: validConfig.publicKey,
        applicationId: validConfig.applicationId,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Bot Token');
    });

    it('rejects empty botToken', () => {
      const result = validateDiscordBotConfig({
        ...validConfig,
        botToken: '   ',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Bot Token');
    });

    it('rejects invalid botToken format', () => {
      const result = validateDiscordBotConfig({
        ...validConfig,
        botToken: 'invalid-no-dots',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Bot Token');
    });

    it('rejects missing publicKey', () => {
      const result = validateDiscordBotConfig({
        botToken: validConfig.botToken,
        applicationId: validConfig.applicationId,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Public Key');
    });

    it('rejects invalid publicKey (wrong length)', () => {
      const result = validateDiscordBotConfig({
        ...validConfig,
        publicKey: 'abc',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Public Key');
    });

    it('rejects missing applicationId', () => {
      const result = validateDiscordBotConfig({
        botToken: validConfig.botToken,
        publicKey: validConfig.publicKey,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Application ID');
    });

    it('rejects non-numeric applicationId', () => {
      const result = validateDiscordBotConfig({
        ...validConfig,
        applicationId: 'abc',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Application ID');
    });

    it('rejects completely empty config', () => {
      const result = validateDiscordBotConfig({});
      expect(result.valid).toBe(false);
    });
  });
});
