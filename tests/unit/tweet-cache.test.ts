import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTweetCacheById,
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

});
