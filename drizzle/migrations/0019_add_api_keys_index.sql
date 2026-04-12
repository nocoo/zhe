-- Add index on api_keys.key_hash for authentication query performance.
-- The verifyApiKeyAndGetUser() function queries by key_hash on every API request.
-- Without this index, authentication degrades to a full table scan as key count grows.
CREATE INDEX IF NOT EXISTS `idx_api_keys_key_hash` ON `api_keys` (`key_hash`);
