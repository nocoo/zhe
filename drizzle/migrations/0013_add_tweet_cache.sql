-- Add tweet_cache table for caching X/Twitter tweet data fetched via xray API.
-- Shared across users (no user_id FK). Primary key is the tweet snowflake ID.
CREATE TABLE tweet_cache (
  tweet_id          TEXT PRIMARY KEY,
  author_username   TEXT NOT NULL,
  author_name       TEXT NOT NULL,
  author_avatar     TEXT NOT NULL,
  tweet_text        TEXT NOT NULL,
  tweet_url         TEXT NOT NULL,
  lang              TEXT,
  tweet_created_at  TEXT NOT NULL,
  raw_data          TEXT NOT NULL,
  fetched_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
