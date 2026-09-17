-- Reuse existing tags for historical analysis. Tag creation is always a user action.
INSERT OR IGNORE INTO link_tags(link_id,tag_id)
SELECT g.link_id,t.id
FROM github_bookmarks g
JOIN links l ON l.id=g.link_id AND l.user_id=g.user_id AND l.original_url=g.source_url
JOIN json_each(g.result_json,'$.analysis.tags') j ON j.type='text'
JOIN tags t ON t.id=(SELECT existing.id FROM tags existing WHERE existing.user_id=g.user_id AND lower(trim(existing.name))=lower(trim(j.value)) ORDER BY existing.created_at,existing.id LIMIT 1);
