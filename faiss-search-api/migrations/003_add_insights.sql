-- Migration: Add typed insights table
-- Date: 2025-12-02
-- Description: Create dedicated insights table with MBID indexing for agent-generated insights
--              This is additive - does not modify existing enrichments table
--
-- Run with: python3 -c "import sqlite3; conn = sqlite3.connect('data/music_kb.sqlite'); conn.executescript(open('migrations/003_add_insights.sql').read())"

-- =====================================================
-- INSIGHTS TABLE - Typed insights with MBID indexing
-- =====================================================
--
-- Design decisions:
-- 1. Separate from generic 'enrichments' table for type safety
-- 2. Denormalized MBID columns for efficient entity page queries
-- 3. insight_type stored as indexed column (not just in JSON)
-- 4. Soft delete support via deleted_at column
-- 5. Schema version tracking for migration support

CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Type discriminator (matches TypeScript _tag field)
    -- Concert, Cover, Sample, PlayHistory, Connection, Link
    insight_type TEXT NOT NULL CHECK (insight_type IN (
        'Concert', 'Cover', 'Sample', 'PlayHistory', 'Connection', 'Link'
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

-- =====================================================
-- INDEXES for efficient queries
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
-- SOURCE ARTISTS JUNCTION TABLE
-- =====================================================
-- Handles the array of source artist MBIDs (can be multiple artists per play)
-- Enables efficient queries like "all insights from plays by Artist X"

CREATE TABLE IF NOT EXISTS insight_source_artists (
    insight_id INTEGER NOT NULL,
    artist_mbid TEXT NOT NULL,
    PRIMARY KEY (insight_id, artist_mbid),
    FOREIGN KEY (insight_id) REFERENCES insights(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_insight_source_artists_mbid
    ON insight_source_artists(artist_mbid);

-- =====================================================
-- VIEW for active insights (excludes soft-deleted)
-- =====================================================

CREATE VIEW IF NOT EXISTS v_active_insights AS
SELECT * FROM insights WHERE deleted_at IS NULL;

-- =====================================================
-- MIGRATION TRACKING TABLE (if not exists)
-- =====================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT UNIQUE NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
);

-- Record this migration
INSERT OR IGNORE INTO schema_migrations (migration_name)
VALUES ('003_add_insights');
