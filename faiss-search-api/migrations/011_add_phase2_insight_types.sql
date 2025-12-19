-- Migration: Add Phase 2 insight types
-- Date: 2025-12-18
-- Description: Expand insight_type CHECK constraint to support DiscoveryArc, LocalScene, DJRecommendation
--
-- SAFETY: This migration preserves all existing data by:
-- 1. Creating backup table first
-- 2. Verifying row counts match before dropping
-- 3. Using explicit column mapping (no SELECT *)
--
-- Run with: python3 scripts/run_migration.py migrations/011_add_phase2_insight_types.sql
--
-- IMPORTANT: Run "SELECT COUNT(*) FROM insights;" before and after to verify data preservation

-- =====================================================
-- PRE-MIGRATION SAFETY: Create backup
-- =====================================================

-- Backup existing data first (will fail silently if table doesn't exist)
DROP TABLE IF EXISTS insights_backup_011;
CREATE TABLE insights_backup_011 AS SELECT * FROM insights;

-- =====================================================
-- RECREATE INSIGHTS TABLE WITH EXPANDED TYPES
-- =====================================================
-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table

-- Step 1: Create new table with expanded types
CREATE TABLE IF NOT EXISTS insights_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Type discriminator (matches TypeScript _tag field)
    -- Phase 1: Concert, Cover, Sample, PlayHistory, Connection, Link
    -- Phase 2: DiscoveryArc, LocalScene, DJRecommendation
    insight_type TEXT NOT NULL CHECK (insight_type IN (
        -- Phase 1 types
        'Concert', 'Cover', 'Sample', 'PlayHistory', 'Connection', 'Link',
        -- Phase 2 types
        'DiscoveryArc', 'LocalScene', 'DJRecommendation'
    )),

    -- Source play
    play_id INTEGER NOT NULL,

    -- Classification (from agent output)
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    source_type TEXT NOT NULL CHECK (source_type IN ('extraction', 'database', 'external')),

    -- Denormalized source MBIDs for indexing (from the play being analyzed)
    source_recording_mbid TEXT,
    source_release_mbid TEXT,

    -- Denormalized referenced MBIDs for entity page queries
    -- These are the MBIDs mentioned IN the insight (e.g., original artist in a cover)
    referenced_artist_mbid TEXT,
    referenced_recording_mbid TEXT,
    referenced_release_mbid TEXT,
    referenced_label_mbid TEXT,

    -- Full insight data (complete JSON including all type-specific fields)
    -- Stores the entire Insight object from TypeScript agent
    data JSON NOT NULL,

    -- Summary for display (extracted from data for quick access)
    summary TEXT,

    -- Soft delete support
    deleted_at TEXT,

    -- Schema version for future migrations
    schema_version TEXT NOT NULL DEFAULT 'v1',

    -- Timestamps
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    -- Foreign key to plays
    FOREIGN KEY (play_id) REFERENCES fact_plays(id) ON DELETE CASCADE
);

-- Step 2: Copy all existing data with explicit column mapping
INSERT INTO insights_new (
    id, insight_type, play_id, confidence, source_type,
    source_recording_mbid, source_release_mbid,
    referenced_artist_mbid, referenced_recording_mbid,
    referenced_release_mbid, referenced_label_mbid,
    data, summary, deleted_at, schema_version,
    created_at, updated_at
)
SELECT
    id, insight_type, play_id, confidence, source_type,
    source_recording_mbid, source_release_mbid,
    referenced_artist_mbid, referenced_recording_mbid,
    referenced_release_mbid, referenced_label_mbid,
    data, summary, deleted_at, schema_version,
    created_at, updated_at
FROM insights;

-- Step 3: Verify row counts match (this will cause migration to fail if counts differ)
-- SQLite doesn't have procedural logic, but we can use a trick with a failing insert
-- if the counts don't match. This creates a constraint violation if counts differ.
CREATE TABLE IF NOT EXISTS _migration_verify_011 (
    check_passed INTEGER CHECK (check_passed = 1)
);
INSERT INTO _migration_verify_011 (check_passed)
SELECT CASE
    WHEN (SELECT COUNT(*) FROM insights) = (SELECT COUNT(*) FROM insights_new)
    THEN 1
    ELSE 0
END;
DROP TABLE _migration_verify_011;

-- Step 4: Drop old table (only reached if verification passed)
DROP TABLE insights;

-- Step 5: Rename new table
ALTER TABLE insights_new RENAME TO insights;

-- =====================================================
-- RECREATE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_insights_play_id ON insights(play_id);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at);
CREATE INDEX IF NOT EXISTS idx_insights_confidence ON insights(confidence);

-- Entity page queries - find all insights mentioning an artist/recording/release
CREATE INDEX IF NOT EXISTS idx_insights_ref_artist
    ON insights(referenced_artist_mbid)
    WHERE referenced_artist_mbid IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_insights_ref_recording
    ON insights(referenced_recording_mbid)
    WHERE referenced_recording_mbid IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_insights_ref_release
    ON insights(referenced_release_mbid)
    WHERE referenced_release_mbid IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_insights_ref_label
    ON insights(referenced_label_mbid)
    WHERE referenced_label_mbid IS NOT NULL AND deleted_at IS NULL;

-- Source entity queries - find insights generated from plays of a specific recording
CREATE INDEX IF NOT EXISTS idx_insights_source_recording
    ON insights(source_recording_mbid)
    WHERE source_recording_mbid IS NOT NULL AND deleted_at IS NULL;

-- Composite index for type + play queries
CREATE INDEX IF NOT EXISTS idx_insights_type_play
    ON insights(insight_type, play_id);

-- =====================================================
-- RECREATE VIEW
-- =====================================================

DROP VIEW IF EXISTS v_active_insights;
CREATE VIEW v_active_insights AS
SELECT * FROM insights WHERE deleted_at IS NULL;

-- =====================================================
-- POST-MIGRATION VERIFICATION
-- =====================================================
-- Final count verification - backup should match final table
-- This table can be dropped after manual verification
-- Run: SELECT COUNT(*) FROM insights_backup_011;
-- Run: SELECT COUNT(*) FROM insights;
-- If counts match, run: DROP TABLE insights_backup_011;

-- =====================================================
-- RECORD MIGRATION
-- =====================================================

INSERT OR IGNORE INTO schema_migrations (migration_name)
VALUES ('011_add_phase2_insight_types');

-- NOTE: Keep insights_backup_011 until you've verified the migration worked.
-- To clean up after verification:
-- DROP TABLE insights_backup_011;
