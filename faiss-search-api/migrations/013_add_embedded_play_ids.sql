-- Migration 013: Add embedded_play_ids table for efficient pending detection
--
-- This table tracks which play IDs have been embedded, enabling O(log n)
-- pending detection via indexed LEFT JOIN instead of O(n) Python set comparison.
--
-- Called from three places:
-- 1. /add endpoint - after add succeeds
-- 2. /integrate endpoint - after hot reload succeeds
-- 3. embed_pending.py script - after API call succeeds

CREATE TABLE IF NOT EXISTS embedded_play_ids (
    play_id INTEGER PRIMARY KEY,
    embedded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index on embedded_at for potential cleanup queries (remove old entries)
CREATE INDEX IF NOT EXISTS idx_embedded_play_ids_at ON embedded_play_ids(embedded_at);
