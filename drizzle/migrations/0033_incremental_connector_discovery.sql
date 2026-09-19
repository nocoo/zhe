-- Durable incremental discovery, including imports and direct SQL writes. Each
-- source consumes its own entries in the same transaction that creates jobs.
CREATE TABLE connector_discovery (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('x','github','screenshot')),
  link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,source,link_id)
);

CREATE TRIGGER connector_link_created AFTER INSERT ON links
BEGIN
  INSERT INTO connector_discovery VALUES(NEW.user_id,'x',NEW.id);
  INSERT INTO connector_discovery VALUES(NEW.user_id,'github',NEW.id);
  INSERT INTO connector_discovery VALUES(NEW.user_id,'screenshot',NEW.id);
END;

CREATE TRIGGER connector_link_changed AFTER UPDATE OF original_url ON links
WHEN OLD.original_url <> NEW.original_url
BEGIN
  INSERT OR IGNORE INTO connector_discovery VALUES(NEW.user_id,'x',NEW.id);
  INSERT OR IGNORE INTO connector_discovery VALUES(NEW.user_id,'github',NEW.id);
  INSERT OR IGNORE INTO connector_discovery VALUES(NEW.user_id,'screenshot',NEW.id);
END;

CREATE TRIGGER connector_preview_removed AFTER UPDATE OF screenshot_url ON links
WHEN OLD.screenshot_url IS NOT NEW.screenshot_url
  AND (NEW.screenshot_url IS NULL OR trim(NEW.screenshot_url)='')
BEGIN
  INSERT OR IGNORE INTO connector_discovery VALUES(NEW.user_id,'screenshot',NEW.id);
END;

-- Backfill once at migration time, then only changed links are visited.
INSERT INTO connector_discovery SELECT user_id,'x',id FROM links;
INSERT INTO connector_discovery SELECT user_id,'github',id FROM links;
INSERT INTO connector_discovery SELECT user_id,'screenshot',id FROM links;

-- MAX(updated_at) can now seek to one index entry per source.
CREATE INDEX idx_x_bookmarks_last_run ON x_bookmarks(user_id,updated_at DESC) WHERE attempts>0;
CREATE INDEX idx_github_bookmarks_last_run ON github_bookmarks(user_id,updated_at DESC) WHERE attempts>0;
CREATE INDEX idx_screenshot_jobs_last_run ON screenshot_jobs(user_id,updated_at DESC) WHERE attempts>0;
