-- Null out backy_pull_secret (key-only auth, no separate secret needed).
-- SQLite < 3.35.0 does not support DROP COLUMN, so we null the values instead.
-- The Drizzle schema no longer declares this column; the app never reads or writes it.
UPDATE user_settings SET backy_pull_secret = NULL WHERE backy_pull_secret IS NOT NULL;
