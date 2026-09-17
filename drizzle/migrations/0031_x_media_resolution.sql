-- Keep the archived file resolution independent of later captures or display aspect edits.
ALTER TABLE x_media ADD COLUMN resolution TEXT;
