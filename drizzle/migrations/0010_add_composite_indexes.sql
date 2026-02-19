-- Composite indexes for analytics aggregation and upload listing performance

-- analytics: per-link listing with ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_analytics_link_created ON analytics(link_id, created_at DESC);

-- analytics: per-link device GROUP BY
CREATE INDEX IF NOT EXISTS idx_analytics_link_device ON analytics(link_id, device);

-- analytics: per-link browser GROUP BY
CREATE INDEX IF NOT EXISTS idx_analytics_link_browser ON analytics(link_id, browser);

-- analytics: per-link OS GROUP BY
CREATE INDEX IF NOT EXISTS idx_analytics_link_os ON analytics(link_id, os);

-- analytics: per-link country DISTINCT
CREATE INDEX IF NOT EXISTS idx_analytics_link_country ON analytics(link_id, country);

-- uploads: user-scoped listing with ORDER BY (created_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_uploads_user_created ON uploads(user_id, created_at DESC, id DESC);
