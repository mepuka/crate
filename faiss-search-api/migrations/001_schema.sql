-- music_kb.sqlite schema
-- Exported from production: 2025-12-03
--
-- This file represents the current database schema.
-- Edge tables are materialized by scripts in faiss-search-api/scripts/

-- =============================================================================
-- CORE PLAY DATA
-- =============================================================================

CREATE TABLE IF NOT EXISTS fact_plays (
    id INTEGER NOT NULL,
    airdate TEXT NOT NULL,
    show INTEGER NOT NULL,
    show_uri TEXT NOT NULL,
    image_uri TEXT,
    thumbnail_uri TEXT,
    song TEXT,
    track_id TEXT,
    recording_id TEXT,
    artist TEXT,
    artist_ids TEXT,
    album TEXT,
    release_id TEXT,
    release_group_id TEXT,
    labels TEXT,
    label_ids TEXT,
    release_date TEXT,
    rotation_status TEXT,
    is_local INTEGER CHECK(is_local IN (0, 1)),
    is_request INTEGER CHECK(is_request IN (0, 1)),
    is_live INTEGER CHECK(is_live IN (0, 1)),
    comment TEXT,
    play_type CHECK(play_type IN ('trackplay', 'nontrackplay')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS play_artists (
    play_id INTEGER NOT NULL,
    artist_mbid TEXT NOT NULL,
    PRIMARY KEY (play_id, artist_mbid)
);

-- =============================================================================
-- MUSICBRAINZ ENTITY TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS mb_artists (
    artist_mbid TEXT PRIMARY KEY NOT NULL,
    artist_name TEXT,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    country TEXT,
    artist_type TEXT,
    begin_area TEXT,
    sort_name TEXT,
    disambiguation TEXT,
    begin_date TEXT,
    end_date TEXT,
    urls TEXT,
    enriched_at TEXT,
    relations TEXT,
    genres TEXT,
    aliases TEXT,
    tags TEXT
);

CREATE TABLE IF NOT EXISTS mb_recordings (
    recording_mbid TEXT PRIMARY KEY NOT NULL,
    song_title TEXT,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    isrc TEXT,
    length_ms INTEGER,
    disambiguation TEXT,
    enriched_at TEXT,
    relations TEXT,
    work_mbids TEXT,
    isrcs TEXT,
    tags TEXT,
    genres TEXT
);

CREATE TABLE IF NOT EXISTS mb_releases (
    release_mbid TEXT PRIMARY KEY NOT NULL,
    album_title TEXT,
    release_date TEXT,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    status TEXT,
    barcode TEXT,
    asin TEXT,
    country TEXT,
    disambiguation TEXT,
    urls TEXT,
    enriched_at TEXT,
    relations TEXT,
    label_info TEXT,
    media TEXT,
    release_group_mbid TEXT,
    packaging TEXT,
    quality TEXT,
    artist_credit TEXT
);

CREATE TABLE IF NOT EXISTS mb_release_groups (
    release_group_mbid TEXT PRIMARY KEY NOT NULL,
    album_title TEXT,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    first_release_date TEXT,
    primary_type TEXT,
    secondary_types TEXT,
    disambiguation TEXT,
    urls TEXT,
    enriched_at TEXT,
    relations TEXT,
    genres TEXT,
    aliases TEXT,
    tags TEXT,
    artist_credit TEXT
);

CREATE TABLE IF NOT EXISTS mb_labels (
    label_mbid TEXT PRIMARY KEY NOT NULL,
    label_name TEXT,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    label_type TEXT,
    label_code INTEGER,
    disambiguation TEXT,
    urls TEXT,
    enriched_at TEXT,
    relations TEXT,
    genres TEXT,
    aliases TEXT,
    tags TEXT,
    country TEXT,
    area TEXT
);

CREATE TABLE IF NOT EXISTS mb_tracks (
    track_mbid TEXT PRIMARY KEY NOT NULL,
    song_title TEXT,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mb_works (
    work_mbid TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    work_type TEXT,
    language TEXT,
    languages TEXT,
    iswcs TEXT,
    attributes TEXT,
    disambiguation TEXT,
    relations TEXT,
    genres TEXT,
    tags TEXT,
    aliases TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mb_areas (
    area_mbid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_name TEXT,
    area_type TEXT,
    date_begin TEXT,
    date_end TEXT,
    disambiguation TEXT,
    relations TEXT,
    genres TEXT,
    tags TEXT,
    aliases TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mb_places (
    place_mbid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    place_type TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    area_mbid TEXT,
    area_name TEXT,
    date_begin TEXT,
    date_end TEXT,
    disambiguation TEXT,
    relations TEXT,
    genres TEXT,
    tags TEXT,
    aliases TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mb_events (
    event_mbid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    event_type TEXT,
    date_begin TEXT,
    date_end TEXT,
    time TEXT,
    cancelled INTEGER DEFAULT 0,
    setlist TEXT,
    disambiguation TEXT,
    relations TEXT,
    genres TEXT,
    tags TEXT,
    aliases TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mb_series (
    series_mbid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    series_type TEXT,
    disambiguation TEXT,
    relations TEXT,
    genres TEXT,
    tags TEXT,
    aliases TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INSIGHTS (Agent-generated)
-- =============================================================================

CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    insight_type TEXT NOT NULL CHECK (insight_type IN (
        'Concert', 'Cover', 'Sample', 'PlayHistory', 'Connection', 'Link'
    )),
    play_id INTEGER NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    source_type TEXT NOT NULL CHECK (source_type IN ('extraction', 'database', 'external')),
    source_recording_mbid TEXT,
    source_release_mbid TEXT,
    referenced_artist_mbid TEXT,
    referenced_recording_mbid TEXT,
    referenced_release_mbid TEXT,
    referenced_label_mbid TEXT,
    data JSON NOT NULL,
    summary TEXT,
    deleted_at TEXT,
    schema_version TEXT NOT NULL DEFAULT 'v1',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (play_id) REFERENCES fact_plays(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS insight_source_artists (
    insight_id INTEGER NOT NULL,
    artist_mbid TEXT NOT NULL,
    PRIMARY KEY (insight_id, artist_mbid),
    FOREIGN KEY (insight_id) REFERENCES insights(id) ON DELETE CASCADE
);

-- =============================================================================
-- LINK CONTENT (Fetched URLs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS link_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    normalized_url TEXT NOT NULL,
    domain TEXT NOT NULL,
    link_type TEXT NOT NULL,
    title TEXT,
    markdown TEXT,
    fetched_at TEXT,
    fetch_status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS play_links (
    play_id INTEGER NOT NULL,
    link_id INTEGER NOT NULL,
    position_start INTEGER,
    position_end INTEGER,
    PRIMARY KEY (play_id, link_id),
    FOREIGN KEY (play_id) REFERENCES fact_plays(id),
    FOREIGN KEY (link_id) REFERENCES link_content(id)
);

-- =============================================================================
-- GRAPH EDGE TABLES (Materialized from JSON relations)
-- =============================================================================

-- Artist-to-Artist edges (band membership, collaboration)
CREATE TABLE IF NOT EXISTS artist_edges (
    source_mbid TEXT NOT NULL,
    target_mbid TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    source_name TEXT,
    target_name TEXT,
    target_type TEXT,
    attributes TEXT,
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (source_mbid, target_mbid, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_ae_source ON artist_edges(source_mbid);
CREATE INDEX IF NOT EXISTS idx_ae_target ON artist_edges(target_mbid);
CREATE INDEX IF NOT EXISTS idx_ae_type ON artist_edges(relationship_type);

-- Label-to-Label edges (ownership, distribution)
CREATE TABLE IF NOT EXISTS label_edges (
    source_mbid TEXT NOT NULL,
    target_mbid TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    source_name TEXT,
    target_name TEXT,
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (source_mbid, target_mbid, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_le_source ON label_edges(source_mbid);
CREATE INDEX IF NOT EXISTS idx_le_target ON label_edges(target_mbid);
CREATE INDEX IF NOT EXISTS idx_le_type ON label_edges(relationship_type);

-- Artist-to-Label edges
CREATE TABLE IF NOT EXISTS artist_label_edges (
    artist_mbid TEXT NOT NULL,
    label_mbid TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    artist_name TEXT,
    label_name TEXT,
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (artist_mbid, label_mbid, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_ale_artist ON artist_label_edges(artist_mbid);
CREATE INDEX IF NOT EXISTS idx_ale_label ON artist_label_edges(label_mbid);

-- Artist-to-Event edges
CREATE TABLE IF NOT EXISTS artist_event_edges (
    artist_mbid TEXT NOT NULL,
    event_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    artist_name TEXT,
    event_name TEXT,
    event_type TEXT,
    event_date TEXT,
    PRIMARY KEY (artist_mbid, event_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_aee_artist ON artist_event_edges(artist_mbid);
CREATE INDEX IF NOT EXISTS idx_aee_event ON artist_event_edges(event_id);
CREATE INDEX IF NOT EXISTS idx_aee_date ON artist_event_edges(event_date);

-- Recording-to-Work links (for covers/versions)
CREATE TABLE IF NOT EXISTS recording_work_links (
    recording_mbid TEXT NOT NULL,
    work_mbid TEXT NOT NULL,
    work_title TEXT,
    attributes TEXT,
    relationship_type TEXT DEFAULT 'performance',
    is_cover INTEGER DEFAULT 0,
    is_live INTEGER DEFAULT 0,
    is_medley INTEGER DEFAULT 0,
    is_instrumental INTEGER DEFAULT 0,
    is_partial INTEGER DEFAULT 0,
    PRIMARY KEY (recording_mbid, work_mbid)
);

CREATE INDEX IF NOT EXISTS idx_rwl_recording ON recording_work_links(recording_mbid);
CREATE INDEX IF NOT EXISTS idx_rwl_work ON recording_work_links(work_mbid);
CREATE INDEX IF NOT EXISTS idx_rwl_type ON recording_work_links(relationship_type);
CREATE INDEX IF NOT EXISTS idx_rwl_cover ON recording_work_links(is_cover);
CREATE INDEX IF NOT EXISTS idx_rwl_live ON recording_work_links(is_live);
CREATE INDEX IF NOT EXISTS idx_rwl_medley ON recording_work_links(is_medley);
CREATE INDEX IF NOT EXISTS idx_rwl_instrumental ON recording_work_links(is_instrumental);

-- Artist-to-Area edges (origins)
CREATE TABLE IF NOT EXISTS artist_area_edges (
    artist_mbid TEXT NOT NULL,
    area_mbid TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    artist_name TEXT,
    area_name TEXT,
    area_type TEXT,
    PRIMARY KEY (artist_mbid, area_mbid, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_aae_artist ON artist_area_edges(artist_mbid);
CREATE INDEX IF NOT EXISTS idx_aae_area ON artist_area_edges(area_mbid);
CREATE INDEX IF NOT EXISTS idx_aae_area_name ON artist_area_edges(area_name);

-- Area hierarchy (geographic containment)
CREATE TABLE IF NOT EXISTS area_hierarchy (
    child_mbid TEXT NOT NULL,
    parent_mbid TEXT NOT NULL,
    child_name TEXT,
    parent_name TEXT,
    child_type TEXT,
    parent_type TEXT,
    depth INTEGER DEFAULT 1,
    PRIMARY KEY (child_mbid, parent_mbid)
);

CREATE INDEX IF NOT EXISTS idx_ah_child ON area_hierarchy(child_mbid);
CREATE INDEX IF NOT EXISTS idx_ah_parent ON area_hierarchy(parent_mbid);
CREATE INDEX IF NOT EXISTS idx_ah_child_name ON area_hierarchy(child_name);

-- Place-to-Recording edges (studios/venues)
CREATE TABLE IF NOT EXISTS place_recording_edges (
    place_mbid TEXT NOT NULL,
    recording_mbid TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    place_name TEXT,
    place_type TEXT,
    area_name TEXT,
    recording_title TEXT,
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (place_mbid, recording_mbid, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_pre_place ON place_recording_edges(place_mbid);
CREATE INDEX IF NOT EXISTS idx_pre_recording ON place_recording_edges(recording_mbid);
CREATE INDEX IF NOT EXISTS idx_pre_area ON place_recording_edges(area_name);

-- =============================================================================
-- SCHEMA MIGRATIONS TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT UNIQUE NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
);
