-- Rebuild projections for media types, source names, and explicit post IDs.
UPDATE search_documents SET revision = revision + 1;
