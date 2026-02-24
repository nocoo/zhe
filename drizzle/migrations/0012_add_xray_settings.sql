-- Add xray API settings to user_settings table
ALTER TABLE user_settings ADD COLUMN xray_api_url TEXT;
ALTER TABLE user_settings ADD COLUMN xray_api_token TEXT;
