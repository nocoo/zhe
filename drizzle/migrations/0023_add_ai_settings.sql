-- Add per-user AI provider settings to user_settings.
ALTER TABLE user_settings ADD COLUMN ai_provider TEXT;
ALTER TABLE user_settings ADD COLUMN ai_api_key TEXT;
ALTER TABLE user_settings ADD COLUMN ai_model TEXT;
ALTER TABLE user_settings ADD COLUMN ai_base_url TEXT;
ALTER TABLE user_settings ADD COLUMN ai_sdk_type TEXT;
ALTER TABLE user_settings ADD COLUMN ai_auth_type TEXT;
