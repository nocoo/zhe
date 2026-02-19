-- User-level settings table for preferences like preview style
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preview_style TEXT NOT NULL DEFAULT 'favicon'
);
