-- Add Backy pull webhook credentials to user_settings
-- Key identifies the user, secret authenticates the request
ALTER TABLE user_settings ADD COLUMN backy_pull_key TEXT;
ALTER TABLE user_settings ADD COLUMN backy_pull_secret TEXT;
