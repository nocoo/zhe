import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isValidWebhookUrl,
  validateBackyConfig,
  maskApiKey,
  getBackyEnvironment,
  buildBackyTag,
  formatFileSize,
  formatTimeAgo,
} from '@/models/backy';

describe('backy model', () => {
  // ==================================================================
  // isValidWebhookUrl
  // ==================================================================
  describe('isValidWebhookUrl', () => {
    it('accepts https URLs', () => {
      expect(isValidWebhookUrl('https://backy.example.com/api/webhook/abc')).toBe(true);
    });

    it('accepts http URLs', () => {
      expect(isValidWebhookUrl('http://localhost:3000/webhook')).toBe(true);
    });

    it('rejects non-URL strings', () => {
      expect(isValidWebhookUrl('not-a-url')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidWebhookUrl('')).toBe(false);
    });

    it('rejects ftp protocol', () => {
      expect(isValidWebhookUrl('ftp://example.com/file')).toBe(false);
    });

    it('rejects javascript protocol', () => {
      expect(isValidWebhookUrl('javascript:alert(1)')).toBe(false);
    });
  });

  // ==================================================================
  // validateBackyConfig
  // ==================================================================
  describe('validateBackyConfig', () => {
    it('accepts valid config', () => {
      const result = validateBackyConfig({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing webhookUrl', () => {
      const result = validateBackyConfig({ apiKey: 'sk-1234567890abcdef' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Webhook URL');
    });

    it('rejects empty webhookUrl', () => {
      const result = validateBackyConfig({ webhookUrl: '  ', apiKey: 'sk-1234567890abcdef' });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid webhookUrl format', () => {
      const result = validateBackyConfig({ webhookUrl: 'not-a-url', apiKey: 'sk-1234567890abcdef' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('格式无效');
    });

    it('rejects missing apiKey', () => {
      const result = validateBackyConfig({ webhookUrl: 'https://backy.example.com/webhook' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('API Key');
    });

    it('rejects empty apiKey', () => {
      const result = validateBackyConfig({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: '   ',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('API Key');
    });

    it('rejects completely empty config', () => {
      const result = validateBackyConfig({});
      expect(result.valid).toBe(false);
    });
  });

  // ==================================================================
  // maskApiKey
  // ==================================================================
  describe('maskApiKey', () => {
    it('masks keys >= 10 chars showing first 4 and last 4', () => {
      expect(maskApiKey('1234567890abcdef')).toBe('1234••••••••cdef');
    });

    it('fully masks keys < 10 chars', () => {
      expect(maskApiKey('short')).toBe('•••••');
    });

    it('handles exactly 10 chars', () => {
      expect(maskApiKey('1234567890')).toBe('1234••7890');
    });

    it('handles empty string', () => {
      expect(maskApiKey('')).toBe('');
    });

    it('handles 9-char key (fully masked)', () => {
      expect(maskApiKey('123456789')).toBe('•••••••••');
    });
  });

  // ==================================================================
  // getBackyEnvironment
  // ==================================================================
  describe('getBackyEnvironment', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('returns "dev" in test environment', () => {
      // NODE_ENV is "test" during vitest runs
      expect(getBackyEnvironment()).toBe('dev');
    });

    it('returns "prod" when NODE_ENV is production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(getBackyEnvironment()).toBe('prod');
    });

    it('returns "dev" when NODE_ENV is development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(getBackyEnvironment()).toBe('dev');
    });
  });

  // ==================================================================
  // buildBackyTag
  // ==================================================================
  describe('buildBackyTag', () => {
    it('builds tag with correct format', () => {
      const tag = buildBackyTag('1.2.1', { links: 42, folders: 3, tags: 5 }, '2026-02-24');
      expect(tag).toBe('v1.2.1-2026-02-24-42lnk-3fld-5tag');
    });

    it('uses today as default date', () => {
      const today = new Date().toISOString().slice(0, 10);
      const tag = buildBackyTag('1.0.0', { links: 0, folders: 0, tags: 0 });
      expect(tag).toBe(`v1.0.0-${today}-0lnk-0fld-0tag`);
    });

    it('handles zero counts', () => {
      const tag = buildBackyTag('2.0.0', { links: 0, folders: 0, tags: 0 }, '2026-01-01');
      expect(tag).toBe('v2.0.0-2026-01-01-0lnk-0fld-0tag');
    });

    it('handles large counts', () => {
      const tag = buildBackyTag('1.0.0', { links: 9999, folders: 100, tags: 500 }, '2026-12-31');
      expect(tag).toBe('v1.0.0-2026-12-31-9999lnk-100fld-500tag');
    });
  });

  // ==================================================================
  // formatFileSize
  // ==================================================================
  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });

    it('formats zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('formats boundary value (1023 bytes)', () => {
      expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('formats boundary value (1024*1024 - 1)', () => {
      expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB');
    });
  });

  // ==================================================================
  // formatTimeAgo
  // ==================================================================
  describe('formatTimeAgo', () => {
    it('returns "刚刚" for just now', () => {
      const now = new Date().toISOString();
      expect(formatTimeAgo(now)).toBe('刚刚');
    });

    it('returns minutes for < 60 minutes', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      expect(formatTimeAgo(thirtyMinsAgo)).toBe('30 分钟前');
    });

    it('returns hours for < 24 hours', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(formatTimeAgo(threeHoursAgo)).toBe('3 小时前');
    });

    it('returns days for < 30 days', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatTimeAgo(fiveDaysAgo)).toBe('5 天前');
    });

    it('returns months for >= 30 days', () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatTimeAgo(sixtyDaysAgo)).toBe('2 个月前');
    });

    it('returns "1 分钟前" for exactly 1 minute ago', () => {
      const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
      expect(formatTimeAgo(oneMinAgo)).toBe('1 分钟前');
    });
  });
});
