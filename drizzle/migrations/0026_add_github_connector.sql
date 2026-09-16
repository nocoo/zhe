CREATE TABLE github_bookmarks (
  link_id INTEGER PRIMARY KEY REFERENCES links(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  full_name TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','complete','failed','unavailable')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_key_id TEXT,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  error_code TEXT,
  captured_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_github_bookmarks_poll ON github_bookmarks(user_id,state,next_attempt_at);

CREATE TRIGGER github_bookmark_url_changed AFTER UPDATE OF original_url ON links
WHEN OLD.original_url <> NEW.original_url
BEGIN
  DELETE FROM github_bookmarks WHERE link_id=OLD.id;
END;
