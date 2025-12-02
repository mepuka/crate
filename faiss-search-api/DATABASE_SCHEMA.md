# Database Schema Documentation

## Overview

The `music_kb.sqlite` database contains KEXP play data, MusicBrainz entity metadata, enrichments, and link content. The schema is designed to support semantic search, entity relationships, and incremental enrichment workflows.

## Core Tables

### fact_plays

The main table containing all KEXP play records (2.2M+ rows).

```sql
CREATE TABLE fact_plays (
    id INTEGER NOT NULL PRIMARY KEY,           -- KEXP play ID
    airdate TEXT NOT NULL,                      -- ISO 8601 datetime
    show INTEGER NOT NULL,                      -- KEXP show ID
    show_uri TEXT NOT NULL,                     -- KEXP show URI
    image_uri TEXT,                             -- Album art URL (full size)
    thumbnail_uri TEXT,                         -- Album art URL (thumbnail)

    -- Track metadata
    song TEXT,                                  -- Song title
    track_id TEXT,                              -- MusicBrainz track MBID
    recording_id TEXT,                          -- MusicBrainz recording MBID

    -- Artist metadata
    artist TEXT,                                -- Artist name
    artist_ids TEXT,                            -- JSON array of artist MBIDs

    -- Album/Release metadata
    album TEXT,                                 -- Album title
    release_id TEXT,                            -- MusicBrainz release MBID
    release_group_id TEXT,                      -- MusicBrainz release group MBID

    -- Label metadata
    labels TEXT,                                -- JSON array of label names
    label_ids TEXT,                             -- JSON array of label MBIDs

    -- Additional metadata
    release_date TEXT,                          -- Album release date
    rotation_status TEXT,                       -- Heavy, Medium, Light, etc.
    is_local INTEGER CHECK(is_local IN (0, 1)), -- Seattle local artist flag
    is_request INTEGER CHECK(is_request IN (0, 1)),
    is_live INTEGER CHECK(is_live IN (0, 1)),
    comment TEXT,                               -- DJ commentary (rich content for search)
    play_type CHECK(play_type IN ('trackplay', 'nontrackplay')),

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_fact_plays_id ON fact_plays (id);
```

**Data Source:** Synced from KEXP API every 30 seconds via `scripts/sync_plays.py`

**Size:** ~2.2M rows

**Key Features:**
- MBIDs enable links to MusicBrainz entities
- DJ comments contain rich semantic content for search
- Supports both trackplays (music) and non-trackplays (shows, airbreaks)

---

## MusicBrainz Entity Tables

These tables store canonical MusicBrainz entity data with rich metadata from the MusicBrainz API.

### mb_artists

```sql
CREATE TABLE mb_artists (
    artist_mbid TEXT PRIMARY KEY NOT NULL,
    artist_name TEXT,

    -- Enriched metadata from MusicBrainz API
    sort_name TEXT,                             -- e.g., "Beatles, The"
    country TEXT,                               -- ISO 3166-1 country code
    artist_type TEXT,                           -- Person, Group, Orchestra, etc.
    disambiguation TEXT,                        -- e.g., "UK rock band"
    begin_area TEXT,                            -- City/region where formed
    begin_date TEXT,                            -- Formation date
    end_date TEXT,                              -- Dissolution date (if applicable)
    urls TEXT,                                  -- JSON array: [{"type": "official", "url": "..."}, ...]

    -- Usage tracking
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,

    -- Enrichment tracking
    enriched_at TEXT,                           -- When MB API data was fetched
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

**Enrichment:** Run `scripts/enrich_mb_entities.py --entity-type artist` to fetch metadata from MusicBrainz API

---

### mb_labels

```sql
CREATE TABLE mb_labels (
    label_mbid TEXT PRIMARY KEY NOT NULL,
    label_name TEXT,

    -- Enriched metadata
    country TEXT,
    label_type TEXT,                            -- Original Production, Distributor, etc.
    disambiguation TEXT,
    label_code INTEGER,                         -- LC-XXXXX number
    urls TEXT,                                  -- JSON array

    -- Usage tracking
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,

    enriched_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

---

### mb_recordings

```sql
CREATE TABLE mb_recordings (
    recording_mbid TEXT PRIMARY KEY NOT NULL,
    song_title TEXT,

    -- Enriched metadata
    length_ms INTEGER,                          -- Duration in milliseconds
    disambiguation TEXT,
    isrc TEXT,                                  -- International Standard Recording Code

    -- Usage tracking
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,

    enriched_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

---

### mb_releases

```sql
CREATE TABLE mb_releases (
    release_mbid TEXT PRIMARY KEY NOT NULL,
    album_title TEXT,
    release_date TEXT,

    -- Enriched metadata
    country TEXT,
    status TEXT,                                -- Official, Promotion, Bootleg, etc.
    disambiguation TEXT,
    barcode TEXT,
    asin TEXT,                                  -- Amazon ID
    urls TEXT,                                  -- JSON array

    -- Usage tracking
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,

    enriched_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

---

### mb_release_groups

```sql
CREATE TABLE mb_release_groups (
    release_group_mbid TEXT PRIMARY KEY NOT NULL,
    album_title TEXT,

    -- Enriched metadata
    primary_type TEXT,                          -- Album, Single, EP, etc.
    secondary_types TEXT,                       -- JSON array: ["Compilation", "Live", etc.]
    disambiguation TEXT,
    first_release_date TEXT,                    -- Earliest release date
    urls TEXT,                                  -- JSON array

    -- Usage tracking
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,

    enriched_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

---

### mb_tracks

```sql
CREATE TABLE mb_tracks (
    track_mbid TEXT PRIMARY KEY NOT NULL,
    song_title TEXT,

    -- Usage tracking
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    play_count INTEGER NOT NULL DEFAULT 0,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

**Note:** Tracks are less commonly enriched with additional metadata. The main value is the MBID itself for entity resolution.

---

## Link Content Tables

These tables store extracted URLs from DJ comments and their fetched content via Jina AI Reader API.

### link_content

```sql
CREATE TABLE link_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,                   -- Original URL
    normalized_url TEXT NOT NULL,               -- Deduplicated URL (no www, no trailing /)
    domain TEXT NOT NULL,                       -- e.g., "bandcamp.com"
    link_type TEXT NOT NULL,                    -- article, artist, reference, event, other

    -- Jina AI Reader content
    title TEXT,                                 -- Page title
    markdown TEXT,                              -- Full Jina markdown output

    -- Metadata
    fetched_at TEXT,
    fetch_status TEXT DEFAULT 'pending',        -- pending, success, failed, skipped
    error_message TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_link_content_domain ON link_content(domain);
CREATE INDEX idx_link_content_fetch_status ON link_content(fetch_status);
CREATE INDEX idx_link_content_link_type ON link_content(link_type);
```

**Enrichment:** Run `scripts/extract_links.py` to extract URLs from DJ comments and fetch content

**Link Types:**
- `article` - News articles, blog posts (e.g., Pitchfork, KEXP blog)
- `artist` - Artist pages (e.g., Bandcamp)
- `reference` - Reference sites (e.g., Wikipedia, Discogs, MusicBrainz)
- `event` - Event pages (e.g., Bandsintown)
- `other` - Uncategorized domains

**Skipped Domains:**
- Video platforms (YouTube, Vimeo)
- Music streaming (Soundcloud, Spotify)
- Social media (Twitter, Instagram, Facebook)
- URL shorteners (bit.ly, t.co)

---

### play_links

Join table connecting plays to their associated links.

```sql
CREATE TABLE play_links (
    play_id INTEGER NOT NULL,
    link_id INTEGER NOT NULL,
    position_start INTEGER,                     -- Character position in comment
    position_end INTEGER,
    PRIMARY KEY (play_id, link_id),
    FOREIGN KEY (play_id) REFERENCES fact_plays(id),
    FOREIGN KEY (link_id) REFERENCES link_content(id)
);

CREATE INDEX idx_play_links_play_id ON play_links(play_id);
CREATE INDEX idx_play_links_link_id ON play_links(link_id);
```

**Usage:**
```sql
-- Get all links for a play
SELECT lc.*
FROM link_content lc
JOIN play_links pl ON lc.id = pl.link_id
WHERE pl.play_id = 123456;

-- Get all plays with links to a specific domain
SELECT fp.*
FROM fact_plays fp
JOIN play_links pl ON fp.id = pl.play_id
JOIN link_content lc ON pl.link_id = lc.id
WHERE lc.domain = 'bandcamp.com';
```

---

## Enrichment System Tables

Generic enrichment framework for extensible metadata.

### enrichment_types

Registry of enrichment types and their schemas.

```sql
CREATE TABLE enrichment_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,                  -- e.g., "hello_world", "cover_art"
    schema_version TEXT NOT NULL,               -- e.g., "v1"
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_enrichment_types_name ON enrichment_types(name);
```

---

### enrichments

Stores enrichment data as JSON blobs.

```sql
CREATE TABLE enrichments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    play_id INTEGER NOT NULL,
    enrichment_type_id INTEGER NOT NULL,
    data JSON NOT NULL,                         -- Enrichment-specific data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (play_id) REFERENCES plays(id) ON DELETE CASCADE,
    FOREIGN KEY (enrichment_type_id) REFERENCES enrichment_types(id),
    UNIQUE(play_id, enrichment_type_id)
);

CREATE INDEX idx_enrichments_play_id ON enrichments(play_id);
CREATE INDEX idx_enrichments_type_id ON enrichments(enrichment_type_id);
```

**Example Usage:**
```sql
-- Get hello_world enrichment for a play
SELECT e.data
FROM enrichments e
JOIN enrichment_types et ON e.enrichment_type_id = et.id
WHERE e.play_id = 123456 AND et.name = 'hello_world';
```

---

## Relationship Tables

### master_relations

Generic relationship table for entity connections.

```sql
CREATE TABLE master_relations (
    subject_id TEXT NOT NULL,                   -- Source entity ID
    subject_type TEXT NOT NULL,                 -- Entity type (play, artist, recording, etc.)
    subject_name TEXT,
    predicate TEXT NOT NULL,                    -- Relationship type (has_recording, has_release, etc.)
    object_id TEXT NOT NULL,                    -- Target entity ID
    object_type TEXT NOT NULL,                  -- Entity type
    object_name TEXT,
    attribute_type TEXT,                        -- Optional relationship attribute
    source TEXT NOT NULL,                       -- Data source (kexp, musicbrainz, etc.)
    kexp_play_id INTEGER,                       -- Reference to play if applicable
    created_at DATETIME,
    updated_at DATETIME
);

CREATE UNIQUE INDEX idx_master_relations_pk
ON master_relations(subject_id, predicate, object_id, attribute_type);

CREATE INDEX idx_relations_forward ON master_relations (subject_id, predicate, object_type);
CREATE INDEX idx_relations_reverse ON master_relations (object_id, predicate, subject_type);
CREATE INDEX idx_relations_predicate ON master_relations (predicate);
CREATE INDEX idx_relations_source ON master_relations (source);
CREATE INDEX idx_relations_kexp_play ON master_relations (kexp_play_id) WHERE kexp_play_id IS NOT NULL;
```

**Triggers:** Auto-populated by triggers on `fact_plays` INSERT:
- `fact_plays_has_recording_trigger` - Creates `has_recording` relations
- `fact_plays_has_release_trigger` - Creates `has_release` relations

---

## Full-Text Search

### entities_fts

FTS5 virtual table for entity search.

```sql
CREATE VIRTUAL TABLE entities_fts USING fts5(
    entity_uri UNINDEXED,
    entity_type UNINDEXED,
    search_document,                            -- Searchable text
    popularity_score UNINDEXED
);
```

**Usage:**
```sql
-- Search for entities
SELECT entity_uri, entity_type, rank
FROM entities_fts
WHERE search_document MATCH 'radiohead'
ORDER BY rank
LIMIT 10;
```

---

## Migrations

Migrations are stored in `migrations/` directory and tracked in the `effect_sql_migrations` table.

### Migration History

| Migration | Description | Date |
|-----------|-------------|------|
| `001_add_enrichments.sql` | Add enrichments framework tables | Initial |
| `002_add_mb_entity_metadata.sql` | Extend mb_* tables with MusicBrainz metadata | 2025-12-02 |

### Running Migrations

```bash
python scripts/run_migration.py --migration migrations/002_add_mb_entity_metadata.sql
```

---

## Data Flow

### 1. Play Ingestion
```
KEXP API → sync_plays.py (every 30s) → fact_plays table
                ↓
        Cover Art Archive API → image_uri, thumbnail_uri
                ↓
        Triggers → master_relations table
```

### 2. Embedding Generation
```
fact_plays → embed_pending.py (hourly) → /api/embeddings/add → FAISS index + play_ids.npy
```

### 3. MusicBrainz Enrichment
```
mb_artists/labels/recordings/releases/release_groups (enriched_at IS NULL)
        ↓
enrich_mb_entities.py → MusicBrainz API → Update mb_* tables with metadata
```

### 4. Link Extraction
```
fact_plays.comment → extract_links.py → Jina AI Reader API
        ↓
link_content + play_links tables
```

### 5. Cover Art Enrichment
```
fact_plays (image_uri IS NULL, release_id/release_group_id NOT NULL)
        ↓
enrich_cover_art.py → Cover Art Archive API → Update image_uri, thumbnail_uri
```

---

## Query Patterns

### Get play with all enrichments

```sql
SELECT
    fp.*,
    lc.url, lc.title, lc.markdown,
    ma.country AS artist_country,
    ma.artist_type,
    mr.length_ms AS recording_length,
    mrg.primary_type AS release_group_type
FROM fact_plays fp
LEFT JOIN play_links pl ON fp.id = pl.play_id
LEFT JOIN link_content lc ON pl.link_id = lc.id
LEFT JOIN mb_artists ma ON json_extract(fp.artist_ids, '$[0]') = ma.artist_mbid
LEFT JOIN mb_recordings mr ON fp.recording_id = mr.recording_mbid
LEFT JOIN mb_release_groups mrg ON fp.release_group_id = mrg.release_group_mbid
WHERE fp.id = ?;
```

### Get top artists by play count

```sql
SELECT artist_name, play_count, country, artist_type
FROM mb_artists
WHERE enriched_at IS NOT NULL
ORDER BY play_count DESC
LIMIT 100;
```

### Get plays with Bandcamp links

```sql
SELECT fp.id, fp.artist, fp.song, lc.url, lc.title
FROM fact_plays fp
JOIN play_links pl ON fp.id = pl.play_id
JOIN link_content lc ON pl.link_id = lc.id
WHERE lc.domain = 'bandcamp.com'
  AND lc.fetch_status = 'success'
ORDER BY fp.airdate DESC
LIMIT 50;
```

---

## Maintenance

### Vacuum Database
```bash
sqlite3 data/music_kb.sqlite "VACUUM;"
```

### Rebuild FTS Index
```sql
INSERT INTO entities_fts(entities_fts) VALUES('rebuild');
```

### Check Database Size
```bash
du -h data/music_kb.sqlite
```

### Integrity Check
```bash
sqlite3 data/music_kb.sqlite "PRAGMA integrity_check;"
```

---

## Performance Considerations

- **Indexes:** All foreign keys and frequently queried columns are indexed
- **JSON columns:** Use `json_extract()` for querying JSON arrays
- **FTS5:** Use MATCH operator for full-text search (don't use LIKE)
- **WAL mode:** Database uses Write-Ahead Logging for concurrent access

```sql
-- Enable WAL mode (if not already enabled)
PRAGMA journal_mode=WAL;
```

---

## See Also

- [Enrichment Scripts](README.md#enrichment-pipeline)
- [API Documentation](README.md#api-endpoints)
- [Migration 002 Details](migrations/002_add_mb_entity_metadata.sql)
