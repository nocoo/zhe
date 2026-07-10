-- Todos: hierarchical task list (parallel to ideas, tree-shaped).
-- Self-referential parentId (adjacency list). Cycle/depth guards live in
-- lib/db/scoped/todos.ts because SQLite recursive CTEs happen at query
-- time, not DDL time; see docs/21-todos-feature.md.
CREATE TABLE todos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES todos(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  title         TEXT    NOT NULL,
  content       TEXT,
  excerpt       TEXT,
  done          INTEGER NOT NULL DEFAULT 0,       -- boolean 0/1
  done_at       INTEGER,                          -- set when done flipped true, cleared when flipped false
  due_at        INTEGER,                          -- optional (v1 date-only, stored as local EOD UTC)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Free-form tag namespace, per-todo, NOT joined to the `tags` table.
-- Colour is client-derived from name; nothing to store.
CREATE TABLE todo_tags (
  todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,                    -- canonical lowercase (application enforces)
  created_at INTEGER NOT NULL,
  PRIMARY KEY (todo_id, name)
);

-- Indexes for todos.
-- Sibling lookup dominates: "give me all children of parent P for user U in position order".
CREATE INDEX idx_todos_user_parent    ON todos(user_id, parent_id, position);
CREATE INDEX idx_todos_user_updated   ON todos(user_id, updated_at DESC);
CREATE INDEX idx_todos_user_done      ON todos(user_id, done);
CREATE INDEX idx_todos_user_due       ON todos(user_id, due_at);
