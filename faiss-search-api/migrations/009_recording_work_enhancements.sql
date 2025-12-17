-- Migration: 009_recording_work_enhancements.sql
-- Description: Add relationship type and attribute flags to recording_work_links
-- for filtering by cover/live/medley/instrumental versions
--
-- Part of: crate-dfi (Enhance recording_work_links with relationship types and attributes)

-- Add new columns for relationship classification
ALTER TABLE recording_work_links ADD COLUMN relationship_type TEXT DEFAULT 'performance';
ALTER TABLE recording_work_links ADD COLUMN is_cover INTEGER DEFAULT 0;
ALTER TABLE recording_work_links ADD COLUMN is_live INTEGER DEFAULT 0;
ALTER TABLE recording_work_links ADD COLUMN is_medley INTEGER DEFAULT 0;
ALTER TABLE recording_work_links ADD COLUMN is_instrumental INTEGER DEFAULT 0;
ALTER TABLE recording_work_links ADD COLUMN is_partial INTEGER DEFAULT 0;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_rwl_type ON recording_work_links(relationship_type);
CREATE INDEX IF NOT EXISTS idx_rwl_cover ON recording_work_links(is_cover);
CREATE INDEX IF NOT EXISTS idx_rwl_live ON recording_work_links(is_live);
CREATE INDEX IF NOT EXISTS idx_rwl_medley ON recording_work_links(is_medley);
CREATE INDEX IF NOT EXISTS idx_rwl_instrumental ON recording_work_links(is_instrumental);

-- Backfill existing data from attributes JSON
-- Parse the JSON attributes array and set boolean flags
UPDATE recording_work_links
SET
    is_cover = CASE WHEN attributes LIKE '%"cover"%' THEN 1 ELSE 0 END,
    is_live = CASE WHEN attributes LIKE '%"live"%' THEN 1 ELSE 0 END,
    is_medley = CASE WHEN attributes LIKE '%"medley"%' THEN 1 ELSE 0 END,
    is_instrumental = CASE WHEN attributes LIKE '%"instrumental"%' THEN 1 ELSE 0 END,
    is_partial = CASE WHEN attributes LIKE '%"partial"%' THEN 1 ELSE 0 END
WHERE attributes IS NOT NULL;

-- Record migration
INSERT INTO schema_migrations (migration_name) VALUES ('009_recording_work_enhancements');
