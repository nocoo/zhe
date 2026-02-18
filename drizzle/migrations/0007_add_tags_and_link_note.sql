-- Add note field to links table
ALTER TABLE links ADD COLUMN note TEXT;

-- Tags table (user-scoped)
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Junction table for link-tag many-to-many relationship
CREATE TABLE IF NOT EXISTS link_tags (
  link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (link_id, tag_id)
);
