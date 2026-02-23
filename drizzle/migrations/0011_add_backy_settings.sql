-- Add Backy remote backup settings to user_settings table
ALTER TABLE user_settings ADD COLUMN backy_webhook_url TEXT;
ALTER TABLE user_settings ADD COLUMN backy_api_key TEXT;
