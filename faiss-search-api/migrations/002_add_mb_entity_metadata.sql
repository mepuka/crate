-- Migration: Add MusicBrainz entity metadata columns
-- Date: 2025-12-02
-- Description: Extend mb_* tables with rich metadata from MusicBrainz API

-- =====================================================
-- ARTISTS - Add metadata columns
-- =====================================================
ALTER TABLE mb_artists ADD COLUMN sort_name TEXT;
ALTER TABLE mb_artists ADD COLUMN country TEXT;
ALTER TABLE mb_artists ADD COLUMN artist_type TEXT;  -- Person, Group, Orchestra, etc.
ALTER TABLE mb_artists ADD COLUMN disambiguation TEXT;
ALTER TABLE mb_artists ADD COLUMN begin_area TEXT;  -- City/region where formed
ALTER TABLE mb_artists ADD COLUMN begin_date TEXT;  -- Formation date
ALTER TABLE mb_artists ADD COLUMN end_date TEXT;    -- Dissolution date (if applicable)

-- Artist URLs (JSON array of {type, url} objects)
ALTER TABLE mb_artists ADD COLUMN urls TEXT;  -- JSON: [{"type": "official", "url": "..."}, ...]

-- Enrichment tracking
ALTER TABLE mb_artists ADD COLUMN enriched_at TEXT;  -- When MB data was fetched

-- =====================================================
-- LABELS - Add metadata columns
-- =====================================================
ALTER TABLE mb_labels ADD COLUMN country TEXT;
ALTER TABLE mb_labels ADD COLUMN label_type TEXT;  -- Original Production, Distributor, etc.
ALTER TABLE mb_labels ADD COLUMN disambiguation TEXT;
ALTER TABLE mb_labels ADD COLUMN label_code INTEGER;  -- LC-XXXXX number

-- Label URLs (JSON array)
ALTER TABLE mb_labels ADD COLUMN urls TEXT;  -- JSON: [{"type": "official", "url": "..."}, ...]

-- Enrichment tracking
ALTER TABLE mb_labels ADD COLUMN enriched_at TEXT;

-- =====================================================
-- RECORDINGS - Add metadata columns
-- =====================================================
ALTER TABLE mb_recordings ADD COLUMN length_ms INTEGER;  -- Duration in milliseconds
ALTER TABLE mb_recordings ADD COLUMN disambiguation TEXT;
ALTER TABLE mb_recordings ADD COLUMN isrc TEXT;  -- International Standard Recording Code

-- Recording doesn't typically have URLs, but can have work relationships
ALTER TABLE mb_recordings ADD COLUMN enriched_at TEXT;

-- =====================================================
-- RELEASES - Add metadata columns
-- =====================================================
ALTER TABLE mb_releases ADD COLUMN country TEXT;
ALTER TABLE mb_releases ADD COLUMN status TEXT;  -- Official, Promotion, Bootleg, etc.
ALTER TABLE mb_releases ADD COLUMN disambiguation TEXT;
ALTER TABLE mb_releases ADD COLUMN barcode TEXT;
ALTER TABLE mb_releases ADD COLUMN asin TEXT;  -- Amazon ID

-- Release URLs (JSON array)
ALTER TABLE mb_releases ADD COLUMN urls TEXT;

-- Enrichment tracking
ALTER TABLE mb_releases ADD COLUMN enriched_at TEXT;

-- =====================================================
-- RELEASE GROUPS - Add metadata columns
-- =====================================================
ALTER TABLE mb_release_groups ADD COLUMN primary_type TEXT;  -- Album, Single, EP, etc.
ALTER TABLE mb_release_groups ADD COLUMN secondary_types TEXT;  -- JSON array: ["Compilation", "Live", etc.]
ALTER TABLE mb_release_groups ADD COLUMN disambiguation TEXT;
ALTER TABLE mb_release_groups ADD COLUMN first_release_date TEXT;  -- Earliest release date

-- Release group URLs (JSON array)
ALTER TABLE mb_release_groups ADD COLUMN urls TEXT;

-- Enrichment tracking
ALTER TABLE mb_release_groups ADD COLUMN enriched_at TEXT;

-- =====================================================
-- LINK CONTENT TABLE - For Jina-fetched URL content
-- =====================================================
CREATE TABLE IF NOT EXISTS link_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    normalized_url TEXT NOT NULL,
    domain TEXT NOT NULL,
    link_type TEXT NOT NULL,  -- youtube, soundcloud, bandcamp, kexp, article, etc.

    -- Jina content
    title TEXT,
    markdown TEXT,  -- Full Jina markdown output

    -- Metadata
    fetched_at TEXT,
    fetch_status TEXT DEFAULT 'pending',  -- pending, success, failed, skipped
    error_message TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_link_content_domain ON link_content(domain);
CREATE INDEX IF NOT EXISTS idx_link_content_fetch_status ON link_content(fetch_status);
CREATE INDEX IF NOT EXISTS idx_link_content_link_type ON link_content(link_type);

-- =====================================================
-- PLAY LINKS JOIN TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS play_links (
    play_id INTEGER NOT NULL,
    link_id INTEGER NOT NULL,
    position_start INTEGER,  -- Character position in comment
    position_end INTEGER,
    PRIMARY KEY (play_id, link_id),
    FOREIGN KEY (play_id) REFERENCES fact_plays(id),
    FOREIGN KEY (link_id) REFERENCES link_content(id)
);

CREATE INDEX IF NOT EXISTS idx_play_links_play_id ON play_links(play_id);
CREATE INDEX IF NOT EXISTS idx_play_links_link_id ON play_links(link_id);
