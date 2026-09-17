-- Curated title is independent of fetched metadata. Existing notes remain authoritative.
ALTER TABLE links ADD COLUMN title TEXT;
DROP TRIGGER search_links_update;
CREATE TRIGGER search_links_update AFTER UPDATE OF user_id,slug,original_url,title,meta_title,meta_description,note,folder_id ON links BEGIN
  UPDATE search_documents SET revision=revision+1,user_id=NEW.user_id,created_at=NEW.created_at WHERE kind='link' AND resource_id=NEW.id;
END;
UPDATE search_documents SET revision=revision+1 WHERE kind='link';
