-- Add rate_limit column to webhooks table (default 5 req/min, max 10)
ALTER TABLE webhooks ADD COLUMN rate_limit INTEGER NOT NULL DEFAULT 5;
