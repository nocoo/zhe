-- X enrichment belongs to the saved link and its owner. No global authenticated tweet cache.
CREATE TABLE x_bookmarks (
  link_id INTEGER PRIMARY KEY REFERENCES links(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  post_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','complete','partial','failed','unavailable')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_key_id TEXT,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  draft_json TEXT,
  result_json TEXT,
  removed_media TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_x_bookmarks_poll ON x_bookmarks(user_id, state, next_attempt_at);

CREATE TABLE x_connector_presence (
  key_id TEXT PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE x_media (
  id TEXT PRIMARY KEY,
  link_id INTEGER NOT NULL REFERENCES x_bookmarks(link_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('photo','video','poster')),
  r2_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','uploading','verified','published')),
  upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(link_id, media_id, kind)
);
CREATE INDEX idx_x_media_owner ON x_media(user_id);

-- Object deletion is durable: a failed R2 request must not lose its cleanup record.
CREATE TABLE r2_deletions (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TRIGGER x_bookmark_url_changed AFTER UPDATE OF original_url ON links
WHEN OLD.original_url <> NEW.original_url
BEGIN
  DELETE FROM x_bookmarks WHERE link_id = OLD.id;
END;

-- Covers web actions, REST, bulk operations, account deletion, and SQL maintenance.
-- A user's explicit file deletion survives later retries of other attachments.
CREATE TRIGGER x_upload_removal BEFORE DELETE ON uploads
BEGIN
  UPDATE x_bookmarks SET removed_media=json_insert(removed_media, '$[#]',
    (SELECT media_id || ':' || kind FROM x_media WHERE upload_id=OLD.id AND state='published'))
  WHERE link_id IN (SELECT link_id FROM x_media WHERE upload_id=OLD.id AND state='published');
END;

CREATE TRIGGER x_media_deleted AFTER DELETE ON x_media
BEGIN
  INSERT OR IGNORE INTO r2_deletions(key, user_id, created_at)
    VALUES(OLD.r2_key, OLD.user_id, CAST(strftime('%s','now') AS INTEGER) * 1000);
  -- D1 does not run this trigger recursively for the poster cascade. Queue and
  -- remove its upload explicitly while the poster row still exists.
  INSERT OR IGNORE INTO r2_deletions(key, user_id, created_at)
    SELECT r2_key,user_id,CAST(strftime('%s','now') AS INTEGER) * 1000 FROM x_media
    WHERE link_id=OLD.link_id AND media_id=OLD.media_id AND kind='poster' AND OLD.kind='video';
  DELETE FROM uploads WHERE user_id=OLD.user_id AND (id=OLD.upload_id OR id IN (
    SELECT upload_id FROM x_media WHERE link_id=OLD.link_id AND media_id=OLD.media_id
    AND kind='poster' AND OLD.kind='video'));
  DELETE FROM x_media WHERE link_id = OLD.link_id AND media_id = OLD.media_id
    AND kind = 'poster' AND OLD.kind = 'video';
END;

CREATE TRIGGER upload_object_deleted AFTER DELETE ON uploads
BEGIN
  INSERT OR IGNORE INTO r2_deletions(key, user_id, created_at)
    VALUES(OLD.key, OLD.user_id, CAST(strftime('%s','now') AS INTEGER) * 1000);
END;
