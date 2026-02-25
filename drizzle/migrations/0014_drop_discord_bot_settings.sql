-- Drop Discord Bot columns from user_settings (Chat SDK removal)
ALTER TABLE user_settings DROP COLUMN discord_bot_token;
ALTER TABLE user_settings DROP COLUMN discord_public_key;
ALTER TABLE user_settings DROP COLUMN discord_application_id;
