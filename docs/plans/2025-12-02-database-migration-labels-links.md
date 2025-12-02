# Database Migration: Labels Metadata + Link Content

**Date:** 2025-12-02
**Status:** Ready for Implementation
**Prereq for:** Crate Research Agent

## Overview

Add two new data capabilities to support the research agent:
1. **Label metadata** - Enrich `mb_labels` with MusicBrainz info (URLs, country, description)
2. **Link content** - Store Jina-fetched content for URLs found in DJ comments

## Current State

### Labels
- ✅ `fact_plays.labels` - JSON array of label names
- ✅ `fact_plays.label_ids` - JSON array of label MBIDs
- ✅ `mb_labels` table with: `label_mbid`, `label_name`, `first_seen`, `last_seen`, `play_count`
- ❌ No label URLs, country, description, or other MB metadata

### Links
- ✅ Frontend extracts links from comments (`packages/web/src/lib/links/extraction.ts`)
- ✅ Link categorization: YouTube, SoundCloud, KEXP, Bandcamp, etc.
- ❌ No server-side link storage
- ❌ No Jina content fetching

## Migration Plan

### 1. Schema Changes

#### 1a. Extend `mb_labels` table

```sql
-- Add columns to existing mb_labels table
ALTER TABLE mb_labels ADD COLUMN country TEXT;
ALTER TABLE mb_labels ADD COLUMN label_type TEXT;  -- e.g., "Original Production", "Distributor"
ALTER TABLE mb_labels ADD COLUMN disambiguation TEXT;
ALTER TABLE mb_labels ADD COLUMN mb_url TEXT;  -- musicbrainz.org URL
ALTER TABLE mb_labels ADD COLUMN official_url TEXT;  -- Label's official website
ALTER TABLE mb_labels ADD COLUMN discogs_url TEXT;
ALTER TABLE mb_labels ADD COLUMN wikipedia_url TEXT;
ALTER TABLE mb_labels ADD COLUMN enriched_at TEXT;  -- When MB data was fetched
```

#### 1b. Create `link_content` table

```sql
CREATE TABLE IF NOT EXISTS link_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    normalized_url TEXT NOT NULL,
    domain TEXT NOT NULL,
    link_type TEXT NOT NULL,  -- youtube, soundcloud, bandcamp, kexp, article, etc.

    -- Jina content
    title TEXT,
    markdown TEXT,  -- Full Jina markdown output
    summary TEXT,   -- AI-generated summary (optional, for agent)

    -- Metadata
    fetched_at TEXT,
    fetch_status TEXT DEFAULT 'pending',  -- pending, success, failed, skipped
    error_message TEXT,

    -- Extracted entities (if found on page)
    extracted_artist_mbids TEXT,  -- JSON array
    extracted_release_mbids TEXT, -- JSON array

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_link_content_domain ON link_content(domain);
CREATE INDEX idx_link_content_fetch_status ON link_content(fetch_status);
CREATE INDEX idx_link_content_link_type ON link_content(link_type);
```

#### 1c. Create `play_links` join table

```sql
CREATE TABLE IF NOT EXISTS play_links (
    play_id INTEGER NOT NULL,
    link_id INTEGER NOT NULL,
    position_start INTEGER,  -- Character position in comment
    position_end INTEGER,
    PRIMARY KEY (play_id, link_id),
    FOREIGN KEY (play_id) REFERENCES fact_plays(id),
    FOREIGN KEY (link_id) REFERENCES link_content(id)
);

CREATE INDEX idx_play_links_play_id ON play_links(play_id);
CREATE INDEX idx_play_links_link_id ON play_links(link_id);
```

### 2. Enrichment Scripts

#### 2a. `enrich_labels.py` - MusicBrainz label metadata

```python
"""
Fetch label metadata from MusicBrainz API for all labels in mb_labels.

Usage:
    python scripts/enrich_labels.py --batch-size 100 --verbose

Rate limits:
    - MusicBrainz: 1 request/second
    - Respects 503 responses with exponential backoff
"""

# For each label_mbid in mb_labels where enriched_at IS NULL:
# 1. GET https://musicbrainz.org/ws/2/label/{mbid}?fmt=json&inc=url-rels
# 2. Extract: country, type, disambiguation
# 3. Extract URLs from url-rels: official, discogs, wikipedia
# 4. UPDATE mb_labels SET country=..., enriched_at=NOW()
```

#### 2b. `enrich_links.py` - Jina content fetching

```python
"""
Extract links from play comments and fetch content via Jina AI.

Usage:
    python scripts/enrich_links.py --batch-size 50 --verbose

Flow:
    1. Query plays with comments that have URLs (regex match)
    2. Extract URLs using same pattern as frontend
    3. For each unique URL not in link_content:
       a. Normalize URL
       b. Categorize by domain
       c. If fetchable (not social, not video-only):
          - POST to Jina reader API
          - Store markdown + title
       d. INSERT into link_content
    4. Create play_links associations

Rate limits:
    - Jina: 200 RPM (3.3 req/sec) on free tier
    - Add 0.5s delay between requests
"""

# Link types to fetch vs skip:
FETCH_TYPES = ['bandcamp', 'article', 'kexp', 'website', 'wikipedia', 'discogs']
SKIP_TYPES = ['youtube', 'soundcloud', 'social', 'spotify']  # Video/audio embeds
```

### 3. API Updates

#### 3a. Update `PlayResult` model

```python
class PlayResult(BaseModel):
    # ... existing fields ...

    # Add label details (optional, populated on demand)
    label_details: Optional[List[LabelDetail]] = None

class LabelDetail(BaseModel):
    mbid: str
    name: str
    country: Optional[str]
    label_type: Optional[str]
    official_url: Optional[str]
```

#### 3b. New endpoints

```python
# GET /api/labels/{mbid}
# Returns full label metadata including URLs

# GET /api/plays/{play_id}/links
# Returns link_content for all links in play's comment

# GET /api/links/by-domain/{domain}
# Find all plays with links to a specific domain
```

### 4. Implementation Order

1. **Migration SQL** - Create tables/columns
2. **enrich_labels.py** - Backfill MB label data
3. **enrich_links.py** - Extract + fetch link content
4. **API models** - Update PlayResult, add LabelDetail
5. **API endpoints** - New label/link endpoints
6. **Sync integration** - Add link extraction to sync_plays.py

### 5. Backfill Strategy

#### Labels (~X unique labels in mb_labels)
- MusicBrainz rate limit: 1 req/sec
- Estimate: ~1 hour for 3600 labels
- Run once, then incremental during sync

#### Links (~Y plays with comments containing URLs)
- Need to scan all comments for URLs
- Jina rate limit: ~3 req/sec
- Skip video/audio platforms (YouTube, SoundCloud, Spotify)
- Estimate: Depends on unique URL count

### 6. Open Questions

1. **Jina API key** - Need to set up account and add to config
2. **Summary generation** - Generate during fetch or defer to agent?
3. **Link refresh** - How often to re-fetch? (Content can change)
4. **Storage limits** - Markdown can be large; truncate at N chars?

## Files to Create/Modify

```
faiss-search-api/
├── migrations/
│   └── 002_add_labels_links.sql        # Schema changes
├── scripts/
│   ├── enrich_labels.py                # MusicBrainz label enrichment
│   └── enrich_links.py                 # Jina link content enrichment
├── app/
│   ├── models.py                       # Add LabelDetail, LinkContent
│   └── services/
│       └── db_service.py               # Add label/link queries
└── app/
    └── routes/
        └── labels.py                   # New label endpoints (optional)
```

## Success Criteria

- [ ] `mb_labels` has country, URLs for 90%+ of labels with MBIDs
- [ ] `link_content` has entries for all unique fetchable URLs in comments
- [ ] `play_links` correctly associates plays with their links
- [ ] API returns label details and link content
- [ ] Sync script extracts links from new plays

## Related Documents

- [Crate Research Agent Design](./2025-12-02-crate-research-agent-design.md)
