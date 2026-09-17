-- Unicode-normalized, user-scoped search projections. Raw sources remain authoritative.
CREATE TABLE search_documents (
  kind TEXT NOT NULL CHECK(kind IN ('link','idea','todo')),
  resource_id INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'web',
  revision INTEGER NOT NULL DEFAULT 0,
  indexed_revision INTEGER NOT NULL DEFAULT -1,
  search_text TEXT NOT NULL DEFAULT '',
  titles TEXT NOT NULL DEFAULT '',
  identities TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '',
  summaries TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY(kind, resource_id)
);
CREATE INDEX idx_search_user_source ON search_documents(user_id, source);
CREATE INDEX idx_search_user_dirty ON search_documents(user_id, indexed_revision, revision);

INSERT INTO search_documents(kind,resource_id,user_id,created_at) SELECT 'link',id,user_id,created_at FROM links;
CREATE TRIGGER search_links_insert AFTER INSERT ON links BEGIN
  INSERT INTO search_documents(kind,resource_id,user_id,created_at) VALUES('link',NEW.id,NEW.user_id,NEW.created_at);
END;
CREATE TRIGGER search_links_update AFTER UPDATE OF user_id,slug,original_url,meta_title,meta_description,note,folder_id ON links BEGIN
  UPDATE search_documents SET revision=revision+1,user_id=NEW.user_id,created_at=NEW.created_at WHERE kind='link' AND resource_id=NEW.id;
END;
CREATE TRIGGER search_links_delete AFTER DELETE ON links BEGIN
  DELETE FROM search_documents WHERE kind='link' AND resource_id=OLD.id;
END;

INSERT INTO search_documents(kind,resource_id,user_id,created_at) SELECT 'idea',id,user_id,created_at FROM ideas;
CREATE TRIGGER search_ideas_insert AFTER INSERT ON ideas BEGIN
  INSERT INTO search_documents(kind,resource_id,user_id,created_at) VALUES('idea',NEW.id,NEW.user_id,NEW.created_at);
END;
CREATE TRIGGER search_ideas_update AFTER UPDATE OF user_id,title,content,excerpt ON ideas BEGIN
  UPDATE search_documents SET revision=revision+1,user_id=NEW.user_id,created_at=NEW.created_at WHERE kind='idea' AND resource_id=NEW.id;
END;
CREATE TRIGGER search_ideas_delete AFTER DELETE ON ideas BEGIN
  DELETE FROM search_documents WHERE kind='idea' AND resource_id=OLD.id;
END;

INSERT INTO search_documents(kind,resource_id,user_id,created_at) SELECT 'todo',id,user_id,created_at FROM todos;
CREATE TRIGGER search_todos_insert AFTER INSERT ON todos BEGIN
  INSERT INTO search_documents(kind,resource_id,user_id,created_at) VALUES('todo',NEW.id,NEW.user_id,NEW.created_at);
END;
CREATE TRIGGER search_todos_update AFTER UPDATE OF user_id,title,content,excerpt,emoji ON todos BEGIN
  UPDATE search_documents SET revision=revision+1,user_id=NEW.user_id,created_at=NEW.created_at WHERE kind='todo' AND resource_id=NEW.id;
END;
CREATE TRIGGER search_todos_delete AFTER DELETE ON todos BEGIN
  DELETE FROM search_documents WHERE kind='todo' AND resource_id=OLD.id;
END;

CREATE TRIGGER search_x_bookmarks_insert AFTER INSERT ON x_bookmarks BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id=NEW.link_id;
END;

CREATE TRIGGER search_x_bookmarks_delete AFTER DELETE ON x_bookmarks BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id=OLD.link_id;
END;

CREATE TRIGGER search_x_bookmarks_update AFTER UPDATE OF result_json,source_url ON x_bookmarks BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id=NEW.link_id;
END;

CREATE TRIGGER search_github_bookmarks_insert AFTER INSERT ON github_bookmarks BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id=NEW.link_id;
END;

CREATE TRIGGER search_github_bookmarks_delete AFTER DELETE ON github_bookmarks BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id=OLD.link_id;
END;

CREATE TRIGGER search_github_bookmarks_update AFTER UPDATE OF result_json,source_url ON github_bookmarks BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id=NEW.link_id;
END;

CREATE TRIGGER search_link_tags_insert AFTER INSERT ON link_tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id IN (NEW.link_id);
END;

CREATE TRIGGER search_link_tags_delete AFTER DELETE ON link_tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id IN (OLD.link_id);
END;

CREATE TRIGGER search_link_tags_update AFTER UPDATE ON link_tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id IN (NEW.link_id,OLD.link_id);
END;

CREATE TRIGGER search_idea_tags_insert AFTER INSERT ON idea_tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='idea' AND resource_id IN (NEW.idea_id);
END;

CREATE TRIGGER search_idea_tags_delete AFTER DELETE ON idea_tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='idea' AND resource_id IN (OLD.idea_id);
END;

CREATE TRIGGER search_idea_tags_update AFTER UPDATE ON idea_tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='idea' AND resource_id IN (NEW.idea_id,OLD.idea_id);
END;

CREATE TRIGGER search_todo_tags_insert AFTER INSERT ON todo_tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='todo' AND resource_id IN (NEW.todo_id);
END;

CREATE TRIGGER search_todo_tags_delete AFTER DELETE ON todo_tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='todo' AND resource_id IN (OLD.todo_id);
END;

CREATE TRIGGER search_todo_tags_update AFTER UPDATE ON todo_tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='todo' AND resource_id IN (NEW.todo_id,OLD.todo_id);
END;

CREATE TRIGGER search_tag_name AFTER UPDATE OF name,user_id ON tags BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE
    (kind='link' AND resource_id IN (SELECT link_id FROM link_tags WHERE tag_id=NEW.id)) OR
    (kind='idea' AND resource_id IN (SELECT idea_id FROM idea_tags WHERE tag_id=NEW.id));
END;
CREATE TRIGGER search_folder_name AFTER UPDATE OF name,user_id ON folders BEGIN
  UPDATE search_documents SET revision=revision+1 WHERE kind='link' AND resource_id IN (SELECT id FROM links WHERE folder_id=NEW.id);
END;
