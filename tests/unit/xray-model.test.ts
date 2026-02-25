import { describe, it, expect } from 'vitest';
import {
  extractTweetId,
  extractTweetImageUrl,
  isValidApiUrl,
  validateXrayConfig,
  maskToken,
  buildTweetApiUrl,
  formatCount,
  formatTweetDate,
  MOCK_TWEET_RESPONSE,
  XRAY_PRESETS,
  XRAY_DEFAULT_URL,
} from '@/models/xray';
import type { XrayTweetData } from '@/models/xray';

describe('xray model', () => {
  // ==================================================================
  // Constants
  // ==================================================================
  describe('XRAY_PRESETS', () => {
    it('has Production and Development presets', () => {
      expect(XRAY_PRESETS).toHaveLength(2);
      expect(XRAY_PRESETS[0].label).toBe('Production');
      expect(XRAY_PRESETS[0].url).toBe('https://xray.hexly.ai');
      expect(XRAY_PRESETS[1].label).toBe('Development');
      expect(XRAY_PRESETS[1].url).toBe('https://xray.dev.hexly.ai');
    });

    it('XRAY_DEFAULT_URL points to Production', () => {
      expect(XRAY_DEFAULT_URL).toBe('https://xray.hexly.ai');
    });
  });

  // ==================================================================
  // extractTweetId
  // ==================================================================
  describe('extractTweetId', () => {
    it('extracts ID from x.com URL', () => {
      expect(extractTweetId('https://x.com/QingQ77/status/2026125563673612595')).toBe(
        '2026125563673612595',
      );
    });

    it('extracts ID from twitter.com URL', () => {
      expect(extractTweetId('https://twitter.com/elonmusk/status/123456789')).toBe('123456789');
    });

    it('extracts ID from mobile.twitter.com URL', () => {
      expect(extractTweetId('https://mobile.twitter.com/user/status/999888777')).toBe('999888777');
    });

    it('extracts ID from www.x.com URL', () => {
      expect(extractTweetId('https://www.x.com/user/status/111222333')).toBe('111222333');
    });

    it('extracts ID from URL with trailing segments (/photo/1)', () => {
      expect(extractTweetId('https://x.com/user/status/123456789/photo/1')).toBe('123456789');
    });

    it('extracts ID from URL with query params', () => {
      expect(extractTweetId('https://x.com/user/status/123456789?s=20&t=abc')).toBe('123456789');
    });

    it('accepts pure numeric ID', () => {
      expect(extractTweetId('2026125563673612595')).toBe('2026125563673612595');
    });

    it('trims whitespace', () => {
      expect(extractTweetId('  2026125563673612595  ')).toBe('2026125563673612595');
    });

    it('returns null for empty string', () => {
      expect(extractTweetId('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(extractTweetId('   ')).toBeNull();
    });

    it('returns null for non-Twitter URL', () => {
      expect(extractTweetId('https://example.com/status/123456789')).toBeNull();
    });

    it('returns null for Twitter URL without status path', () => {
      expect(extractTweetId('https://x.com/user')).toBeNull();
    });

    it('returns null for invalid URL', () => {
      expect(extractTweetId('not-a-url-or-id')).toBeNull();
    });

    it('returns null for URL with non-numeric ID', () => {
      expect(extractTweetId('https://x.com/user/status/abc')).toBeNull();
    });
  });

  // ==================================================================
  // extractTweetImageUrl
  // ==================================================================
  describe('extractTweetImageUrl', () => {
    const baseTweet: XrayTweetData = {
      id: '123',
      text: 'test',
      author: {
        id: '1',
        username: 'user',
        name: 'User',
        profile_image_url: 'https://pbs.twimg.com/avatar.jpg',
        followers_count: 0,
        is_verified: false,
      },
      created_at: '2026-01-01T00:00:00.000Z',
      url: 'https://x.com/user/status/123',
      metrics: { retweet_count: 0, like_count: 0, reply_count: 0, quote_count: 0, view_count: 0, bookmark_count: 0 },
      is_retweet: false,
      is_quote: false,
      is_reply: false,
      lang: 'en',
      entities: { hashtags: [], mentioned_users: [], urls: [] },
    };

    it('returns null when no media', () => {
      expect(extractTweetImageUrl(baseTweet)).toBeNull();
    });

    it('returns null when media is empty array', () => {
      expect(extractTweetImageUrl({ ...baseTweet, media: [] })).toBeNull();
    });

    it('returns PHOTO url', () => {
      const tweet = {
        ...baseTweet,
        media: [{ id: '1', type: 'PHOTO' as const, url: 'https://pbs.twimg.com/media/photo.jpg' }],
      };
      expect(extractTweetImageUrl(tweet)).toBe('https://pbs.twimg.com/media/photo.jpg');
    });

    it('returns first PHOTO url when multiple media items', () => {
      const tweet = {
        ...baseTweet,
        media: [
          { id: '1', type: 'VIDEO' as const, url: 'https://video.twimg.com/v.mp4', thumbnail_url: 'https://pbs.twimg.com/thumb.jpg' },
          { id: '2', type: 'PHOTO' as const, url: 'https://pbs.twimg.com/media/photo1.jpg' },
          { id: '3', type: 'PHOTO' as const, url: 'https://pbs.twimg.com/media/photo2.jpg' },
        ],
      };
      expect(extractTweetImageUrl(tweet)).toBe('https://pbs.twimg.com/media/photo1.jpg');
    });

    it('returns VIDEO thumbnail_url when no PHOTO', () => {
      const tweet = {
        ...baseTweet,
        media: [{ id: '1', type: 'VIDEO' as const, url: 'https://video.twimg.com/v.mp4', thumbnail_url: 'https://pbs.twimg.com/thumb.jpg' }],
      };
      expect(extractTweetImageUrl(tweet)).toBe('https://pbs.twimg.com/thumb.jpg');
    });

    it('returns GIF thumbnail_url when no PHOTO', () => {
      const tweet = {
        ...baseTweet,
        media: [{ id: '1', type: 'GIF' as const, url: 'https://video.twimg.com/g.mp4', thumbnail_url: 'https://pbs.twimg.com/gif-thumb.jpg' }],
      };
      expect(extractTweetImageUrl(tweet)).toBe('https://pbs.twimg.com/gif-thumb.jpg');
    });

    it('returns null when VIDEO has no thumbnail_url and no PHOTO', () => {
      const tweet = {
        ...baseTweet,
        media: [{ id: '1', type: 'VIDEO' as const, url: 'https://video.twimg.com/v.mp4' }],
      };
      expect(extractTweetImageUrl(tweet)).toBeNull();
    });

    it('prefers PHOTO over VIDEO thumbnail', () => {
      const tweet = {
        ...baseTweet,
        media: [
          { id: '1', type: 'VIDEO' as const, url: 'https://video.twimg.com/v.mp4', thumbnail_url: 'https://pbs.twimg.com/thumb.jpg' },
          { id: '2', type: 'PHOTO' as const, url: 'https://pbs.twimg.com/media/photo.jpg' },
        ],
      };
      expect(extractTweetImageUrl(tweet)).toBe('https://pbs.twimg.com/media/photo.jpg');
    });
  });

  // ==================================================================
  // isValidApiUrl
  // ==================================================================
  describe('isValidApiUrl', () => {
    it('accepts https URLs', () => {
      expect(isValidApiUrl('https://api.example.com')).toBe(true);
    });

    it('accepts http URLs', () => {
      expect(isValidApiUrl('http://localhost:7027')).toBe(true);
    });

    it('rejects non-URL strings', () => {
      expect(isValidApiUrl('not-a-url')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidApiUrl('')).toBe(false);
    });

    it('rejects ftp protocol', () => {
      expect(isValidApiUrl('ftp://example.com')).toBe(false);
    });
  });

  // ==================================================================
  // validateXrayConfig
  // ==================================================================
  describe('validateXrayConfig', () => {
    it('accepts valid config', () => {
      const result = validateXrayConfig({
        apiUrl: 'https://xray.hexly.ai',
        apiToken: 'sk-1234567890abcdef',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing apiUrl', () => {
      const result = validateXrayConfig({ apiToken: 'sk-1234567890abcdef' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('API URL');
    });

    it('rejects empty apiUrl', () => {
      const result = validateXrayConfig({ apiUrl: '  ', apiToken: 'sk-1234567890abcdef' });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid apiUrl format', () => {
      const result = validateXrayConfig({ apiUrl: 'not-a-url', apiToken: 'sk-1234567890abcdef' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('格式无效');
    });

    it('rejects missing apiToken', () => {
      const result = validateXrayConfig({ apiUrl: 'https://xray.hexly.ai' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Token');
    });

    it('rejects empty apiToken', () => {
      const result = validateXrayConfig({
        apiUrl: 'https://xray.hexly.ai',
        apiToken: '   ',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Token');
    });

    it('rejects completely empty config', () => {
      const result = validateXrayConfig({});
      expect(result.valid).toBe(false);
    });
  });

  // ==================================================================
  // maskToken
  // ==================================================================
  describe('maskToken', () => {
    it('masks tokens >= 10 chars showing first 4 and last 4', () => {
      expect(maskToken('1234567890abcdef')).toBe('1234••••••••cdef');
    });

    it('fully masks tokens < 10 chars', () => {
      expect(maskToken('short')).toBe('•••••');
    });

    it('handles exactly 10 chars', () => {
      expect(maskToken('1234567890')).toBe('1234••7890');
    });

    it('handles empty string', () => {
      expect(maskToken('')).toBe('');
    });
  });

  // ==================================================================
  // buildTweetApiUrl
  // ==================================================================
  describe('buildTweetApiUrl', () => {
    it('builds correct URL with /api prefix', () => {
      expect(buildTweetApiUrl('https://xray.hexly.ai', '123456789')).toBe(
        'https://xray.hexly.ai/api/twitter/tweets/123456789',
      );
    });

    it('strips trailing slash from base URL', () => {
      expect(buildTweetApiUrl('https://xray.hexly.ai/', '123456789')).toBe(
        'https://xray.hexly.ai/api/twitter/tweets/123456789',
      );
    });

    it('strips multiple trailing slashes', () => {
      expect(buildTweetApiUrl('https://xray.hexly.ai///', '123456789')).toBe(
        'https://xray.hexly.ai/api/twitter/tweets/123456789',
      );
    });
  });

  // ==================================================================
  // formatCount
  // ==================================================================
  describe('formatCount', () => {
    it('returns raw number for < 1000', () => {
      expect(formatCount(42)).toBe('42');
    });

    it('formats thousands', () => {
      expect(formatCount(1625)).toBe('1.6K');
    });

    it('formats millions', () => {
      expect(formatCount(1_500_000)).toBe('1.5M');
    });

    it('handles zero', () => {
      expect(formatCount(0)).toBe('0');
    });

    it('handles exactly 1000', () => {
      expect(formatCount(1000)).toBe('1.0K');
    });
  });

  // ==================================================================
  // formatTweetDate
  // ==================================================================
  describe('formatTweetDate', () => {
    it('formats ISO date string', () => {
      const result = formatTweetDate('2026-02-24T02:42:32.000Z');
      // We cannot assert exact format because it depends on locale/timezone,
      // but we can verify it returns a non-empty string containing date parts
      expect(result).toBeTruthy();
      expect(result).toContain('2026');
      expect(result).toContain('02');
      expect(result).toContain('24');
    });
  });

  // ==================================================================
  // MOCK_TWEET_RESPONSE
  // ==================================================================
  describe('MOCK_TWEET_RESPONSE', () => {
    it('has expected structure', () => {
      expect(MOCK_TWEET_RESPONSE.success).toBe(true);
      expect(MOCK_TWEET_RESPONSE.data.id).toBe('2026360908398862478');
      expect(MOCK_TWEET_RESPONSE.data.author.username).toBe('karpathy');
      expect(MOCK_TWEET_RESPONSE.data.metrics).toBeDefined();
      expect(MOCK_TWEET_RESPONSE.data.entities).toBeDefined();
    });

    it('contains media array', () => {
      expect(MOCK_TWEET_RESPONSE.data.media).toBeDefined();
      expect(MOCK_TWEET_RESPONSE.data.media!.length).toBeGreaterThan(0);
      expect(MOCK_TWEET_RESPONSE.data.media![0].type).toBe('PHOTO');
    });

    it('contains quoted_tweet', () => {
      expect(MOCK_TWEET_RESPONSE.data.quoted_tweet).toBeDefined();
      expect(MOCK_TWEET_RESPONSE.data.quoted_tweet!.author.username).toBe('SuhailKakar');
      expect(MOCK_TWEET_RESPONSE.data.quoted_tweet!.media).toBeDefined();
      expect(MOCK_TWEET_RESPONSE.data.quoted_tweet!.media![0].type).toBe('VIDEO');
    });
  });
});
