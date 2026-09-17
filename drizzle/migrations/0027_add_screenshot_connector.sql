CREATE TABLE screenshot_jobs (
  link_id INTEGER PRIMARY KEY REFERENCES links(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','complete','failed','unavailable')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_key_id TEXT,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT UNIQUE,
  public_url TEXT,
  sha256 TEXT,
  error_code TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_screenshot_jobs_poll ON screenshot_jobs(user_id,state,next_attempt_at);

-- Retire old generated previews when the link changes; preserve a user-supplied replacement.
CREATE TRIGGER screenshot_url_changed AFTER UPDATE OF original_url ON links
WHEN OLD.original_url <> NEW.original_url
BEGIN
  UPDATE links SET screenshot_url=NULL WHERE id=NEW.id
    AND screenshot_url=(SELECT public_url FROM screenshot_jobs WHERE link_id=NEW.id);
  DELETE FROM screenshot_jobs WHERE link_id=NEW.id;
END;

-- Publication uses the reserved public_url, so it does not invalidate its own job.
CREATE TRIGGER screenshot_replaced AFTER UPDATE OF screenshot_url ON links
WHEN OLD.screenshot_url IS NOT NEW.screenshot_url
BEGIN
  DELETE FROM screenshot_jobs WHERE link_id=NEW.id AND public_url IS NOT NEW.screenshot_url;
END;

CREATE TRIGGER screenshot_job_deleted AFTER DELETE ON screenshot_jobs
WHEN OLD.r2_key IS NOT NULL
BEGIN
  INSERT INTO r2_deletions(key,user_id,created_at)
    VALUES(OLD.r2_key,OLD.user_id,CAST(strftime('%s','now') AS INTEGER)*1000)
    ON CONFLICT(key) DO UPDATE SET created_at=MAX(r2_deletions.created_at+1,excluded.created_at);
END;

-- Each lease gets a fresh key: an abandoned upload can never overwrite a later attempt.
CREATE TRIGGER screenshot_key_replaced AFTER UPDATE OF r2_key ON screenshot_jobs
WHEN OLD.r2_key IS NOT NULL AND OLD.r2_key IS NOT NEW.r2_key
BEGIN
  INSERT INTO r2_deletions(key,user_id,created_at)
    VALUES(OLD.r2_key,OLD.user_id,CAST(strftime('%s','now') AS INTEGER)*1000)
    ON CONFLICT(key) DO UPDATE SET created_at=MAX(r2_deletions.created_at+1,excluded.created_at);
END;
