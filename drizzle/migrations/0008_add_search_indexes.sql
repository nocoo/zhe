-- Performance indexes for user-scoped queries and search

-- links: every getLinks() query filters by user_id
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);

-- links: folder filtering uses (user_id, folder_id) together
CREATE INDEX IF NOT EXISTS idx_links_user_folder ON links(user_id, folder_id);

-- analytics: per-link queries (click trends, device breakdown)
CREATE INDEX IF NOT EXISTS idx_analytics_link_id ON analytics(link_id);

-- folders: user-scoped folder listing
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);

-- tags: user-scoped tag listing
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);

-- link_tags: reverse lookup (find links by tag)
CREATE INDEX IF NOT EXISTS idx_link_tags_tag_id ON link_tags(tag_id);

-- uploads: user-scoped upload listing
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
