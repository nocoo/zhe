-- API key timestamps are Unix seconds. NULL means the key never expires.
-- Existing keys retain their original creation time and become permanent.
ALTER TABLE api_keys ADD COLUMN expires_at INTEGER;
