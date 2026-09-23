CREATE TABLE connector_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('x','github','screenshot')),
  kind TEXT NOT NULL CHECK(kind IN ('snapshot','queued','started','finished')),
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  error_code TEXT,
  connector_name TEXT,
  text_chars INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  media_total INTEGER NOT NULL DEFAULT 0,
  archived_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_connector_events_link ON connector_events(user_id,link_id,id DESC);

CREATE TRIGGER connector_history_url_changed AFTER UPDATE OF original_url ON links
WHEN OLD.original_url <> NEW.original_url
BEGIN
  DELETE FROM connector_events WHERE link_id=NEW.id;
END;

INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,text_chars,media_count,media_total,archived_bytes,created_at) SELECT j.user_id,j.link_id,'x','snapshot',j.state,j.attempts,j.error_code,(SELECT name FROM api_keys WHERE id=j.lease_key_id AND user_id=j.user_id),COALESCE(length(json_extract(j.result_json,'$.tweet.text')),0),(SELECT COUNT(*) FROM x_media WHERE link_id=j.link_id AND state='published' AND kind<>'poster'),COALESCE(json_array_length(j.result_json,'$.tweet.media'),0),(SELECT COALESCE(SUM(size),0) FROM x_media WHERE link_id=j.link_id AND state='published'),j.updated_at FROM x_bookmarks j;

CREATE TRIGGER x_connector_event_insert AFTER INSERT ON x_bookmarks
BEGIN
  INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,text_chars,media_count,media_total,archived_bytes,created_at) VALUES(NEW.user_id,NEW.link_id,'x',CASE NEW.state WHEN 'pending' THEN 'queued' WHEN 'running' THEN 'started' ELSE 'finished' END,NEW.state,NEW.attempts,NEW.error_code,(SELECT name FROM api_keys WHERE id=NEW.lease_key_id AND user_id=NEW.user_id),COALESCE(length(json_extract(NEW.result_json,'$.tweet.text')),0),(SELECT COUNT(*) FROM x_media WHERE link_id=NEW.link_id AND state='published' AND kind<>'poster'),COALESCE(json_array_length(NEW.result_json,'$.tweet.media'),0),(SELECT COALESCE(SUM(size),0) FROM x_media WHERE link_id=NEW.link_id AND state='published'),NEW.updated_at);
END;

CREATE TRIGGER x_connector_event_update AFTER UPDATE ON x_bookmarks
WHEN OLD.state IS NOT NEW.state OR OLD.attempts IS NOT NEW.attempts
BEGIN
  INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,created_at) SELECT OLD.user_id,OLD.link_id,'x','finished','failed',OLD.attempts,'interrupted',(SELECT name FROM api_keys WHERE id=OLD.lease_key_id AND user_id=OLD.user_id),NEW.updated_at
    WHERE OLD.state='running' AND OLD.lease_until<=NEW.updated_at AND (NEW.state='pending' OR (NEW.state='running' AND NEW.attempts>OLD.attempts));
  INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,text_chars,media_count,media_total,archived_bytes,created_at) VALUES(NEW.user_id,NEW.link_id,'x',CASE NEW.state WHEN 'pending' THEN 'queued' WHEN 'running' THEN 'started' ELSE 'finished' END,NEW.state,NEW.attempts,NEW.error_code,(SELECT name FROM api_keys WHERE id=NEW.lease_key_id AND user_id=NEW.user_id),COALESCE(length(json_extract(NEW.result_json,'$.tweet.text')),0),(SELECT COUNT(*) FROM x_media WHERE link_id=NEW.link_id AND state='published' AND kind<>'poster'),COALESCE(json_array_length(NEW.result_json,'$.tweet.media'),0),(SELECT COALESCE(SUM(size),0) FROM x_media WHERE link_id=NEW.link_id AND state='published'),NEW.updated_at);
END;

INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,text_chars,media_count,media_total,archived_bytes,created_at) SELECT j.user_id,j.link_id,'github','snapshot',j.state,j.attempts,j.error_code,(SELECT name FROM api_keys WHERE id=j.lease_key_id AND user_id=j.user_id),COALESCE(length(json_extract(j.result_json,'$.readme')),0),0,0,COALESCE(length(CAST(json_extract(j.result_json,'$.readme') AS BLOB)),0),j.updated_at FROM github_bookmarks j;

CREATE TRIGGER github_connector_event_insert AFTER INSERT ON github_bookmarks
BEGIN
  INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,text_chars,media_count,media_total,archived_bytes,created_at) VALUES(NEW.user_id,NEW.link_id,'github',CASE NEW.state WHEN 'pending' THEN 'queued' WHEN 'running' THEN 'started' ELSE 'finished' END,NEW.state,NEW.attempts,NEW.error_code,(SELECT name FROM api_keys WHERE id=NEW.lease_key_id AND user_id=NEW.user_id),COALESCE(length(json_extract(NEW.result_json,'$.readme')),0),0,0,COALESCE(length(CAST(json_extract(NEW.result_json,'$.readme') AS BLOB)),0),NEW.updated_at);
END;

CREATE TRIGGER github_connector_event_update AFTER UPDATE ON github_bookmarks
WHEN OLD.state IS NOT NEW.state OR OLD.attempts IS NOT NEW.attempts
BEGIN
  INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,created_at) SELECT OLD.user_id,OLD.link_id,'github','finished','failed',OLD.attempts,'interrupted',(SELECT name FROM api_keys WHERE id=OLD.lease_key_id AND user_id=OLD.user_id),NEW.updated_at
    WHERE OLD.state='running' AND OLD.lease_until<=NEW.updated_at AND (NEW.state='pending' OR (NEW.state='running' AND NEW.attempts>OLD.attempts));
  INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,text_chars,media_count,media_total,archived_bytes,created_at) VALUES(NEW.user_id,NEW.link_id,'github',CASE NEW.state WHEN 'pending' THEN 'queued' WHEN 'running' THEN 'started' ELSE 'finished' END,NEW.state,NEW.attempts,NEW.error_code,(SELECT name FROM api_keys WHERE id=NEW.lease_key_id AND user_id=NEW.user_id),COALESCE(length(json_extract(NEW.result_json,'$.readme')),0),0,0,COALESCE(length(CAST(json_extract(NEW.result_json,'$.readme') AS BLOB)),0),NEW.updated_at);
END;

INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,text_chars,media_count,media_total,archived_bytes,created_at) SELECT j.user_id,j.link_id,'screenshot','snapshot',j.state,j.attempts,j.error_code,(SELECT name FROM api_keys WHERE id=j.lease_key_id AND user_id=j.user_id),0,CASE WHEN j.state='complete' THEN 1 ELSE 0 END,CASE WHEN j.state='complete' THEN 1 ELSE 0 END,0,j.updated_at FROM screenshot_jobs j;

CREATE TRIGGER screenshot_connector_event_insert AFTER INSERT ON screenshot_jobs
BEGIN
  INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,text_chars,media_count,media_total,archived_bytes,created_at) VALUES(NEW.user_id,NEW.link_id,'screenshot',CASE NEW.state WHEN 'pending' THEN 'queued' WHEN 'running' THEN 'started' ELSE 'finished' END,NEW.state,NEW.attempts,NEW.error_code,(SELECT name FROM api_keys WHERE id=NEW.lease_key_id AND user_id=NEW.user_id),0,CASE WHEN NEW.state='complete' THEN 1 ELSE 0 END,CASE WHEN NEW.state='complete' THEN 1 ELSE 0 END,0,NEW.updated_at);
END;

CREATE TRIGGER screenshot_connector_event_update AFTER UPDATE ON screenshot_jobs
WHEN OLD.state IS NOT NEW.state OR OLD.attempts IS NOT NEW.attempts
BEGIN
  INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,created_at) SELECT OLD.user_id,OLD.link_id,'screenshot','finished','failed',OLD.attempts,'interrupted',(SELECT name FROM api_keys WHERE id=OLD.lease_key_id AND user_id=OLD.user_id),NEW.updated_at
    WHERE OLD.state='running' AND OLD.lease_until<=NEW.updated_at AND (NEW.state='pending' OR (NEW.state='running' AND NEW.attempts>OLD.attempts));
  INSERT INTO connector_events(user_id,link_id,source,kind,state,attempts,error_code,connector_name,text_chars,media_count,media_total,archived_bytes,created_at) VALUES(NEW.user_id,NEW.link_id,'screenshot',CASE NEW.state WHEN 'pending' THEN 'queued' WHEN 'running' THEN 'started' ELSE 'finished' END,NEW.state,NEW.attempts,NEW.error_code,(SELECT name FROM api_keys WHERE id=NEW.lease_key_id AND user_id=NEW.user_id),0,CASE WHEN NEW.state='complete' THEN 1 ELSE 0 END,CASE WHEN NEW.state='complete' THEN 1 ELSE 0 END,0,NEW.updated_at);
END;
