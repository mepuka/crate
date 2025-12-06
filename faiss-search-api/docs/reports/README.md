# MusicBrainz Data Analysis Reports

**Generated**: 2025-12-03
**Database**: `/root/faiss-search-api/data/music_kb.sqlite` (production)

This directory contains comprehensive analysis of the MusicBrainz dump data imported into the production database.

---

## Report Overview

### 1. [musicbrainz-data-analysis.md](./musicbrainz-data-analysis.md)
**Main comprehensive report** (668 lines)

Complete analysis covering:
- Data structure and schema documentation
- URL type analysis (44 different URL types, 521K+ URLs)
- Connection graph statistics (111K+ relationships)
- Genre and tag analysis (1,183 genres, 7,109 tags)
- Aliases analysis (50K+ aliases)
- Integration opportunities for the research agent
- Schema recommendations and indexing strategies
- Performance optimization recommendations
- Storage impact estimates

**Use this for**: Understanding the complete data landscape, planning integration work, and making schema decisions.

### 2. [mb-data-examples.md](./mb-data-examples.md)
**Practical examples and queries** (450 lines)

Contains:
- Real data structure examples from the database
- Sample JSON structures for relations, URLs, and connections
- SQL query patterns for common use cases
- Graph traversal examples
- API response format suggestions
- Statistics queries

**Use this for**: Implementing queries, designing API endpoints, and understanding actual data patterns.

### 3. [mb-data-highlights.md](./mb-data-highlights.md)
**Interesting findings and statistics** (337 lines)

Highlights:
- Most prolific collaborators (William Parker: 136 bands!)
- Largest ensembles (Floating Points/LSO: 323 members)
- Most common instruments (guitar, drums, vocals)
- Artists with most external URLs
- Genre distribution insights
- Label relationship patterns
- Network statistics

**Use this for**: Understanding data quality, discovering edge cases, and identifying interesting research opportunities.

---

## Key Statistics

| Metric | Value |
|--------|-------|
| **Total enriched records** | 169,759 |
| Artists with MB data | 65,219 (96.4%) |
| Labels with MB data | 21,336 (97.8%) |
| Release groups with MB data | 83,204 (98.6%) |
| **Total URLs** | 521,278 |
| Unique URL types | 44 |
| **Total relationships** | 111,331 |
| Band member connections | 82,554 |
| Band membership connections | 28,777 |
| Event connections | 110,156 |
| **Genres** | 1,183 unique |
| **Tags** | 7,109 unique |
| **Aliases** | 50,079 |

---

## Database Schema

### Tables Analyzed
- `mb_artists` - 67,664 rows
- `mb_labels` - 21,822 rows
- `mb_release_groups` - 84,362 rows

### Key Columns
Each table contains:
- `relations` - JSON with band_members, member_of_bands, collaborators, urls, label_relations, events
- `genres` - JSON array of genre names
- `aliases` - JSON array of alternative names
- `tags` - JSON array of user-contributed tags

---

## Top Integration Opportunities

### 1. Network Discovery (High Value)
- Find band members (18,074 bands documented)
- Find bands an artist was in (10,609 artists)
- Find artists on same label (5,536 artists with label connections)
- Trace label ownership chains (10,998 ownership relationships)

### 2. External Service Integration (Easy Implementation)
- Streaming links: 90,441 URLs (Spotify, Apple Music, Tidal)
- Social media: 53,038 URLs
- Bandcamp: 15,030 URLs
- Discogs: 108,993 URLs across all entity types
- Official homepages: 22,131 URLs

### 3. Genre-Based Discovery (Good Coverage)
- Artist genre search: 23,802 artists (35%)
- Label genre search: 1,384 labels (6%)
- Release group genre search: 58,151 albums (69%)

### 4. Event/Concert Data
- 110,156 event connections for tour history

---

## Performance Recommendations

### Immediate Actions
1. Create JSON indexes for `relations.band_members`, `relations.member_of_bands`, `relations.label_relations`
2. Create indexes on `genres` columns for all tables
3. Add partial indexes for URL types (bandcamp, discogs, streaming)

### Short-Term
1. Materialize artist-genre junction table for fast lookups
2. Create artist-relationship graph table for efficient network queries
3. Build entity-URL lookup table for quick URL access

### Long-Term
1. Implement graph database for multi-hop traversal
2. Add FTS indexes for alias and tag search
3. Set up periodic dump refresh pipeline

**See full details in**: [musicbrainz-data-analysis.md](./musicbrainz-data-analysis.md) Section 8

---

## Sample Queries

### Find Band Members
```sql
SELECT
    artist_name,
    json_extract(relations, '$.band_members') as members
FROM mb_artists
WHERE json_array_length(json_extract(relations, '$.band_members')) > 0;
```

### Find Artists by Genre
```sql
SELECT artist_name, genres
FROM mb_artists
WHERE genres LIKE '%jazz%'
    AND genres IS NOT NULL;
```

### Find Bandcamp URLs
```sql
SELECT
    artist_name,
    json_extract(relations, '$.urls.bandcamp') as bandcamp_urls
FROM mb_artists
WHERE json_extract(relations, '$.urls.bandcamp') IS NOT NULL;
```

**More examples in**: [mb-data-examples.md](./mb-data-examples.md) Section "Example Query Patterns"

---

## Interesting Findings

### Most Prolific Collaborators
1. William Parker - 136 bands
2. Pharoah Sanders, Adam Rudolph & Hamid Drake - 106 bands
3. Bill Laswell - 61 bands

### Largest Ensembles
1. Floating Points, Pharoah Sanders & The London Symphony Orchestra - 323 members
2. Berliner Philharmoniker - 287 members
3. Leontyne Price, New Philharmonia Orchestra, Zubin Mehta - 254 members

### Most Connected Artists (URLs)
1. Vision Éternel - 124 URLs
2. Taylor Swift - 100 URLs
3. David Guetta - 97 URLs

**Full details in**: [mb-data-highlights.md](./mb-data-highlights.md)

---

## Next Steps

### Phase 1: Foundation (Week 1)
1. Implement JSON indexes on `relations` fields
2. Create genre indexes on all tables
3. Add basic API endpoints for URL extraction

### Phase 2: Core Features (Week 2-3)
1. Materialize artist-genre junction table
2. Build band member lookup endpoints
3. Implement label roster queries
4. Add genre-based filtering to existing endpoints

### Phase 3: Advanced Features (Week 4+)
1. Build relationship graph table
2. Implement multi-hop graph traversal
3. Add FTS search for aliases and tags
4. Create "similar artists" discovery

### Phase 4: Optimization (Ongoing)
1. Performance monitoring and query optimization
2. Cache frequently accessed relationships
3. Consider graph database migration for complex queries
4. Set up periodic dump refresh automation

---

## Files Summary

| File | Lines | Size | Purpose |
|------|-------|------|---------|
| musicbrainz-data-analysis.md | 668 | 17KB | Complete technical analysis |
| mb-data-examples.md | 450 | 9.4KB | Query patterns and examples |
| mb-data-highlights.md | 337 | 9.7KB | Interesting statistics |
| **Total** | **1,455** | **36.1KB** | **Complete analysis suite** |

---

## Contact & Updates

These reports were generated through automated analysis of the production database. The data represents a snapshot as of 2025-12-03.

For updates or questions about the data:
- Check the `enriched_at` column in each table for freshness
- Re-run analysis scripts after dump updates
- Consult MusicBrainz documentation for schema changes

---

**Report Generation Method**: Python scripts executed on production server analyzing SQLite database with JSON field parsing and statistical aggregation.
