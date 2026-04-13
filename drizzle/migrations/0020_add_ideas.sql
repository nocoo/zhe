-- Ideas table for storing markdown thoughts
CREATE TABLE ideas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  content    TEXT    NOT NULL,
  excerpt    TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Idea-Tag many-to-many relation (reuses existing tags table)
CREATE TABLE idea_tags (
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  tag_id  TEXT    NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (idea_id, tag_id)
);

-- Indexes for ideas
CREATE INDEX idx_ideas_user_id ON ideas(user_id);
CREATE INDEX idx_ideas_created_at ON ideas(user_id, created_at DESC);
CREATE INDEX idx_ideas_updated_at ON ideas(user_id, updated_at DESC);
