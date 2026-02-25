import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTweetCacheById,
  getTweetCacheByIds,
  upsertTweetCache,
} from '@/lib/db';
import { clearMockStorage } from '../mocks/db-storage';

const SAMPLE_TWEET = {
  tweetId: '2026360908398862478',
  authorUsername: 'karpathy',
  authorName: 'Andrej Karpathy',
  authorAvatar: 'https://pbs.twimg.com/profile_images/1296667294148382721/9Pr6XrPB_normal.jpg',
  tweetText: 'CLIs are super exciting precisely because they are a "legacy" technology.',
  tweetUrl: 'https://x.com/karpathy/status/2026360908398862478',
  lang: 'en',
  tweetCreatedAt: '2026-02-24T18:17:43.000Z',
  rawData: JSON.stringify({ id: '2026360908398862478', text: 'CLIs are super exciting' }),
};

describe('Tweet Cache DB Operations', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  describe('getTweetCacheById', () => {
    it('returns null when cache is empty', async () => {
      const result = await getTweetCacheById('nonexistent');
      expect(result).toBeNull();
    });

    it('returns cached tweet after upsert', async () => {
      await upsertTweetCache(SAMPLE_TWEET);
      const result = await getTweetCacheById(SAMPLE_TWEET.tweetId);

      expect(result).not.toBeNull();
      expect(result!.tweetId).toBe(SAMPLE_TWEET.tweetId);
      expect(result!.authorUsername).toBe('karpathy');
      expect(result!.authorName).toBe('Andrej Karpathy');
      expect(result!.tweetText).toBe(SAMPLE_TWEET.tweetText);
      expect(result!.tweetUrl).toBe(SAMPLE_TWEET.tweetUrl);
      expect(result!.lang).toBe('en');
    });

    it('returns null for non-matching tweet ID', async () => {
      await upsertTweetCache(SAMPLE_TWEET);
      const result = await getTweetCacheById('999999');
      expect(result).toBeNull();
    });
  });

  describe('upsertTweetCache', () => {
    it('inserts a new tweet into cache', async () => {
      const result = await upsertTweetCache(SAMPLE_TWEET);

      expect(result.tweetId).toBe(SAMPLE_TWEET.tweetId);
      expect(result.authorUsername).toBe('karpathy');
      expect(result.fetchedAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    it('updates existing tweet on conflict', async () => {
      const first = await upsertTweetCache(SAMPLE_TWEET);
      const originalFetchedAt = first.fetchedAt;

      // Wait a tiny bit so updatedAt differs
      const updated = await upsertTweetCache({
        ...SAMPLE_TWEET,
        authorName: 'AK Updated',
        tweetText: 'Updated text',
      });

      expect(updated.tweetId).toBe(SAMPLE_TWEET.tweetId);
      expect(updated.authorName).toBe('AK Updated');
      expect(updated.tweetText).toBe('Updated text');
      // fetchedAt should be preserved from original insert
      expect(updated.fetchedAt).toBe(originalFetchedAt);
    });

    it('handles null lang correctly', async () => {
      const result = await upsertTweetCache({
        ...SAMPLE_TWEET,
        lang: null,
      });
      expect(result.lang).toBeNull();
    });

    it('stores rawData as JSON string', async () => {
      const result = await upsertTweetCache(SAMPLE_TWEET);
      expect(() => JSON.parse(result.rawData)).not.toThrow();
      const parsed = JSON.parse(result.rawData);
      expect(parsed.id).toBe('2026360908398862478');
    });
  });

  describe('getTweetCacheByIds', () => {
    it('returns empty Map for empty input', async () => {
      const result = await getTweetCacheByIds([]);
      expect(result.size).toBe(0);
    });

    it('returns empty Map when no IDs match', async () => {
      const result = await getTweetCacheByIds(['nonexistent1', 'nonexistent2']);
      expect(result.size).toBe(0);
    });

    it('returns Map with matching tweets', async () => {
      await upsertTweetCache(SAMPLE_TWEET);
      await upsertTweetCache({
        ...SAMPLE_TWEET,
        tweetId: '111222333',
        authorUsername: 'elonmusk',
        tweetUrl: 'https://x.com/elonmusk/status/111222333',
      });

      const result = await getTweetCacheByIds([
        SAMPLE_TWEET.tweetId,
        '111222333',
      ]);

      expect(result.size).toBe(2);
      expect(result.get(SAMPLE_TWEET.tweetId)?.authorUsername).toBe('karpathy');
      expect(result.get('111222333')?.authorUsername).toBe('elonmusk');
    });

    it('returns only matching IDs (partial match)', async () => {
      await upsertTweetCache(SAMPLE_TWEET);

      const result = await getTweetCacheByIds([
        SAMPLE_TWEET.tweetId,
        'nonexistent',
      ]);

      expect(result.size).toBe(1);
      expect(result.has(SAMPLE_TWEET.tweetId)).toBe(true);
      expect(result.has('nonexistent')).toBe(false);
    });

    it('provides O(1) lookup by tweet ID', async () => {
      await upsertTweetCache(SAMPLE_TWEET);

      const result = await getTweetCacheByIds([SAMPLE_TWEET.tweetId]);
      const cached = result.get(SAMPLE_TWEET.tweetId);

      expect(cached).toBeDefined();
      expect(cached!.tweetId).toBe(SAMPLE_TWEET.tweetId);
      expect(cached!.authorAvatar).toBe(SAMPLE_TWEET.authorAvatar);
    });
  });
});
