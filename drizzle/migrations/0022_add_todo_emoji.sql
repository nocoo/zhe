-- Add optional emoji icon column to todos.
-- Purely decorative: 1–4 codepoints picked from a client-side palette;
-- validated in the action layer. No index — never queried against.
ALTER TABLE todos ADD COLUMN emoji TEXT;
