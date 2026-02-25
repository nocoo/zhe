-- Add Discord Bot settings to user_settings table
ALTER TABLE user_settings ADD COLUMN discord_bot_token TEXT;
ALTER TABLE user_settings ADD COLUMN discord_public_key TEXT;
ALTER TABLE user_settings ADD COLUMN discord_application_id TEXT;
