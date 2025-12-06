# MusicBrainz Dump Data Analysis Report

**Database**: `/root/faiss-search-api/data/music_kb.sqlite`
**Generated**: 2025-12-03
**Total Enriched Records**: 169,759 across 3 entity types

---

## Executive Summary

The production database now contains comprehensive MusicBrainz dump data with relationship graphs, genres, tags, aliases, and structured URLs. This report analyzes the data structure, quality, and integration opportunities for the research agent.

### Key Statistics

- **65,219 artists** with enriched MB data
- **21,336 labels** with enriched MB data
- **83,204 release groups** with enriched MB data
- **521,278 URLs** across 44 different types
- **111,331 relationship connections** between entities
- **1,183 unique genres** and **7,109 unique tags**

---

## 1. Data Structure Analysis

### 1.1 Relations JSON Structure

Each entity type has a `relations` JSON column containing structured data:

#### Artist Relations

```json
{
  "band_members": [
    {
      "mbid": "70ed549e-b472-4a73-b5af-4c962976143f",
      "name": "Durand Jones",
      "type": "Person",
      "begin": null,
      "end": null,
      "attributes": ["vocals", "guitar"]
    }
  ],
  "member_of_bands": [
    {
      "mbid": "53732191-7511-466e-b47f-872cb373e623",
      "name": "Gerald Wilson Orchestra",
      "type": "Group",
      "begin": null,
      "end": null,
      "attributes": ["tenor saxophone"]
    }
  ],
  "collaborators": [],
  "urls": {
    "official homepage": ["http://example.com"],
    "bandcamp": ["https://artist.bandcamp.com"],
    "discogs": ["https://www.discogs.com/artist/123"],
    "social network": [
      "https://twitter.com/artist",
      "https://www.facebook.com/artist"
    ]
  },
  "label_relations": [
    {
      "mbid": "c9688aac-e22f-49d4-a065-748020fa3d88",
      "name": "MG III Music",
      "type": "personal publisher",
      "begin": null,
      "end": null
    }
  ],
  "events": [...]
}
```

#### Label Relations

```json
{
  "label_relations": [
    {
      "mbid": "a3f9cae3-eb80-46aa-8a1d-3538c8c55380",
      "name": "Brainfeeder Records",
      "type": "label ownership",
      "begin": null,
      "end": null
    }
  ],
  "urls": {...}
}
```

### 1.2 URL Structure

URLs are organized by type as a dictionary mapping URL type to array of URL strings:

```json
{
  "official homepage": ["http://kamasiwashington.com/"],
  "bandcamp": ["https://kamasiwashington.bandcamp.com/"],
  "discogs": ["https://www.discogs.com/artist/324293"],
  "free streaming": [
    "https://open.spotify.com/artist/6HQYnRM4OzToCYPpVBInuU",
    "https://www.deezer.com/artist/5196129"
  ],
  "social network": [
    "https://twitter.com/KamasiW",
    "https://www.facebook.com/kamasiw"
  ]
}
```

---

## 2. URL Type Analysis

### 2.1 Artist URLs (521,278 total)

| URL Type | Count | Description |
|----------|-------|-------------|
| other databases | 78,675 | VIAF, WorldCat, Library of Congress, etc. |
| discogs | 56,519 | Discogs artist pages |
| free streaming | 53,851 | Spotify, Deezer free tiers |
| social network | 53,038 | Twitter, Facebook, Instagram |
| streaming | 36,590 | Apple Music, Tidal |
| wikidata | 27,597 | Wikidata entity links |
| purchase for download | 23,734 | iTunes, Beatport |
| allmusic | 22,621 | AllMusic artist pages |
| official homepage | 22,131 | Artist official websites |
| bandcamp | 15,030 | Bandcamp artist pages |
| last.fm | 14,284 | Last.fm profiles |
| VIAF | 13,430 | Virtual International Authority File |
| soundcloud | 12,290 | SoundCloud profiles |
| youtube | 12,080 | YouTube channels |
| myspace | 11,794 | MySpace profiles (legacy) |
| songkick | 11,213 | Concert listings |
| lyrics | 9,411 | Lyrics sites |
| IMDb | 7,748 | IMDb entries |
| secondhandsongs | 4,107 | Cover version database |
| setlistfm | 4,066 | Setlist database |

**Additional types**: BBC Music, biography, discography page, bandsintown, fanpage, blog, wikipedia, purchase for mail-order, crowdfunding, and 24 more.

### 2.2 Label URLs (48,514 total)

| URL Type | Count |
|----------|-------|
| discogs | 16,423 |
| social network | 8,029 |
| official site | 7,292 |
| wikidata | 4,163 |
| bandcamp | 3,385 |
| other databases | 3,253 |
| soundcloud | 1,905 |
| youtube | 1,572 |
| logo | 1,001 |
| catalog site | 784 |

### 2.3 Release Group URLs (98,849 total)

| URL Type | Count |
|----------|-------|
| discogs | 36,051 |
| other databases | 24,274 |
| wikidata | 23,624 |
| allmusic | 18,537 |
| review | 8,477 |
| wikipedia | 4,854 |
| lyrics | 4,799 |

---

## 3. Connection Graph Statistics

### 3.1 Artist Connections

| Connection Type | Artists with Connections | Total Items |
|----------------|-------------------------|-------------|
| Band members | 18,074 | 82,554 |
| Member of bands | 10,609 | 28,777 |
| Collaborators | 0 | 0 |
| Label relations | 5,536 | 7,868 |
| Events | 16,065 | 110,156 |

**Total**: 111,331 connection items across all artists

### 3.2 Artist Label Relationship Types

Relationships between artists and labels:

| Relationship Type | Count |
|------------------|-------|
| recording contract | 477 |
| label founder | 388 |
| personal publisher | 350 |
| personal label | 169 |
| owner | 39 |
| producer position at | 21 |
| artists and repertoire position at | 4 |
| creative position at | 3 |

### 3.3 Label-to-Label Relationships

Labels with connections: **6,362 labels** (17,140 total relationships)

| Relationship Type | Count |
|------------------|-------|
| label ownership | 10,998 |
| label distribution | 2,800 |
| imprint | 2,188 |
| label rename | 840 |
| label reissue | 314 |

---

## 4. Genre and Tag Analysis

### 4.1 Artist Genres

- **Artists with genres**: 23,802 (35.2% of total)
- **Unique genres**: 1,183
- **Artists with tags**: 25,841 (38.2% of total)
- **Unique tags**: 7,109

**Top 30 Genres**:

1. rock (2,352)
2. hip hop (2,284)
3. jazz (2,153)
4. punk (1,866)
5. electronic (1,847)
6. pop (1,570)
7. indie rock (1,503)
8. soul (1,175)
9. alternative rock (1,072)
10. folk (918)
11. singer-songwriter (840)
12. r&b (840)
13. indie pop (810)
14. pop rock (743)
15. death metal (696)
16. psychedelic rock (694)
17. metal (658)
18. black metal (646)
19. post-punk (643)
20. blues (639)
21. house (589)
22. country (548)
23. experimental (547)
24. ambient (516)
25. funk (514)
26. punk rock (498)
27. new wave (465)
28. reggae (454)
29. contemporary r&b (447)
30. hard rock (441)

**Notable Tags** (beyond genres):
- usa (698)
- uk (687)
- british (663)
- american (580)
- 2008 universal fire victim (576)
- classic pop and rock (575)
- rock and indie (536)

### 4.2 Label Genres

- **Labels with genres**: 1,384 (6.3% of total)
- **Labels with tags**: 1,931 (8.9% of total)

**Top 15 Label Genres**:

1. hip hop (242)
2. drum and bass (128)
3. punk (125)
4. electronic (105)
5. rock (104)
6. jazz (94)
7. pop (88)
8. indie rock (84)
9. techno (51)
10. alternative rock (46)
11. house (40)
12. metal (39)
13. classical (32)
14. instrumental (32)
15. downtempo (32)

### 4.3 Release Group Genres

- **Release groups with genres**: 58,151 (68.9% of total)
- **Release groups with tags**: 58,856 (69.8% of total)

**Top 20 Genres**:

1. rock (23,930)
2. electronic (14,475)
3. pop (9,333)
4. indie rock (6,911)
5. hip hop (6,512)
6. jazz (4,909)
7. alternative rock (4,893)
8. soul (4,459)
9. punk (4,203)
10. pop rock (3,659)
11. funk (3,283)
12. synth-pop (3,207)
13. disco (2,714)
14. experimental (2,526)
15. house (2,350)
16. country (2,257)
17. new wave (2,186)
18. downtempo (1,972)
19. folk (1,970)
20. indie pop (1,935)

---

## 5. Aliases Analysis

- **Artists with aliases**: 21,312 (31.5% of total)
- **Total aliases**: 50,079
- **Average aliases per artist**: 2.3

Aliases include alternative spellings, stage names, localized names, and variations.

---

## 6. Current Schema

### 6.1 Current Indexes

All three tables have only primary key indexes:

- `mb_artists`: `artist_mbid` (PRIMARY KEY)
- `mb_labels`: `label_mbid` (PRIMARY KEY)
- `mb_release_groups`: `release_group_mbid` (PRIMARY KEY)

**No JSON indexes exist** for efficient querying of nested relations.

---

## 7. Integration Opportunities

### 7.1 High-Value Research Features

#### A. Network Discovery
- **"Find band members"**: 82,554 band member relationships
- **"Find bands this artist was in"**: 28,777 membership relationships
- **"Find artists on the same label"**: 7,868 artist-label connections
- **"Find label ownership chain"**: 10,998 ownership relationships

#### B. External Discovery
- **"Find artist's Bandcamp"**: 15,030 Bandcamp URLs
- **"Find streaming links"**: 90,441 streaming URLs (Spotify, Tidal, Apple Music)
- **"Find social media"**: 53,038 social network URLs
- **"Find artist homepage"**: 22,131 official homepages
- **"Find Discogs page"**: 56,519 artist + 36,051 release + 16,423 label = 108,993 total

#### C. Genre-Based Discovery
- **"Find similar artists by genre"**: 23,802 artists with genres
- **"Find jazz labels"**: 1,384 labels with genres
- **"Find electronic albums"**: 14,475 electronic release groups

#### D. Event/Concert Data
- **110,156 event connections** available for tour history and concert information

### 7.2 API Endpoint Suggestions

```typescript
// Network endpoints
GET /api/artists/:mbid/band-members
GET /api/artists/:mbid/bands
GET /api/artists/:mbid/label-relationships
GET /api/labels/:mbid/artists
GET /api/labels/:mbid/related-labels

// External link endpoints
GET /api/artists/:mbid/urls
GET /api/artists/:mbid/urls/:type  // e.g., /urls/bandcamp
GET /api/labels/:mbid/urls
GET /api/release-groups/:mbid/urls

// Discovery endpoints
GET /api/artists/by-genre/:genre
GET /api/labels/by-genre/:genre
GET /api/release-groups/by-genre/:genre

// Graph endpoints
GET /api/graph/collaborators/:mbid?depth=2
GET /api/graph/label-network/:mbid
```

---

## 8. Performance Recommendations

### 8.1 Critical Indexes

#### Genre Indexes (highest priority)

```sql
-- Artist genre index
CREATE INDEX idx_artists_genres ON mb_artists(genres)
WHERE genres IS NOT NULL;

-- Label genre index
CREATE INDEX idx_labels_genres ON mb_labels(genres)
WHERE genres IS NOT NULL;

-- Release group genre index
CREATE INDEX idx_release_groups_genres ON mb_release_groups(genres)
WHERE genres IS NOT NULL;
```

#### JSON Path Indexes

SQLite 3.45+ supports JSON path indexes:

```sql
-- Index band members for fast lookup
CREATE INDEX idx_artists_band_members
ON mb_artists(json_extract(relations, '$.band_members'));

-- Index member_of_bands
CREATE INDEX idx_artists_member_of
ON mb_artists(json_extract(relations, '$.member_of_bands'));

-- Index label relations
CREATE INDEX idx_artists_labels
ON mb_artists(json_extract(relations, '$.label_relations'));

-- Index label ownership
CREATE INDEX idx_labels_ownership
ON mb_labels(json_extract(relations, '$.label_relations'));
```

#### URL Type Indexes

```sql
-- Index for URL existence checks
CREATE INDEX idx_artists_has_urls
ON mb_artists(json_extract(relations, '$.urls'))
WHERE relations IS NOT NULL;
```

### 8.2 Denormalization Tables

For frequent queries, consider materializing relationships:

#### Artist-Genre Junction Table

```sql
CREATE TABLE artist_genres (
    artist_mbid TEXT NOT NULL,
    genre TEXT NOT NULL,
    PRIMARY KEY (artist_mbid, genre),
    FOREIGN KEY (artist_mbid) REFERENCES mb_artists(artist_mbid)
);

CREATE INDEX idx_artist_genres_genre ON artist_genres(genre);
CREATE INDEX idx_artist_genres_artist ON artist_genres(artist_mbid);
```

#### Band Member Graph Table

```sql
CREATE TABLE artist_relationships (
    source_mbid TEXT NOT NULL,
    target_mbid TEXT NOT NULL,
    relationship_type TEXT NOT NULL, -- 'band_member', 'member_of', etc.
    attributes TEXT, -- JSON array of attributes
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (source_mbid, target_mbid, relationship_type)
);

CREATE INDEX idx_rel_source ON artist_relationships(source_mbid);
CREATE INDEX idx_rel_target ON artist_relationships(target_mbid);
CREATE INDEX idx_rel_type ON artist_relationships(relationship_type);
```

#### URL Lookup Table

```sql
CREATE TABLE entity_urls (
    entity_type TEXT NOT NULL, -- 'artist', 'label', 'release_group'
    entity_mbid TEXT NOT NULL,
    url_type TEXT NOT NULL,
    url TEXT NOT NULL,
    PRIMARY KEY (entity_mbid, url_type, url)
);

CREATE INDEX idx_urls_entity ON entity_urls(entity_mbid);
CREATE INDEX idx_urls_type ON entity_urls(url_type);
CREATE INDEX idx_urls_bandcamp ON entity_urls(url_type) WHERE url_type = 'bandcamp';
CREATE INDEX idx_urls_discogs ON entity_urls(url_type) WHERE url_type = 'discogs';
```

### 8.3 Full-Text Search

For alias and tag searching:

```sql
-- FTS5 virtual table for aliases
CREATE VIRTUAL TABLE artist_aliases_fts USING fts5(
    artist_mbid UNINDEXED,
    artist_name,
    aliases,
    content=mb_artists,
    content_rowid=rowid
);

-- FTS5 virtual table for tags
CREATE VIRTUAL TABLE artist_tags_fts USING fts5(
    artist_mbid UNINDEXED,
    tags,
    genres,
    content=mb_artists,
    content_rowid=rowid
);
```

---

## 9. Data Quality Notes

### 9.1 Coverage Statistics

| Entity Type | Total | Enriched | % Coverage |
|-------------|-------|----------|------------|
| Artists | 67,664 | 65,219 | 96.4% |
| Labels | 21,822 | 21,336 | 97.8% |
| Release Groups | 84,362 | 83,204 | 98.6% |

### 9.2 Empty Relationship Fields

- **Collaborators**: 0 items (field exists but unused in dump)
- This may be populated in future dumps or requires different extraction

### 9.3 Date Granularity

Relationship begin/end dates are mostly `null` in the current dump. This limits temporal queries like "when was this person in this band?"

---

## 10. Agent Research Use Cases

### 10.1 Artist Research Queries

1. **Discography Context**
   - "Find all releases on Stones Throw Records"
   - "What labels has Flying Lotus worked with?"

2. **Collaboration Network**
   - "Who are the members of Radiohead?"
   - "What bands was Dave Grohl in?"
   - "Find common collaborators between artists X and Y"

3. **Genre Exploration**
   - "Find hip hop artists in my collection"
   - "What genres does this label specialize in?"

4. **External Links**
   - "Find Bandcamp pages for artists I've played"
   - "Get Wikipedia links for this artist"
   - "Find social media for promotion"

### 10.2 Label Research Queries

1. **Label Network**
   - "What labels does Domino own?"
   - "Find distribution deals for this label"
   - "Show imprint structure"

2. **Roster Discovery**
   - "What artists are on 4AD?"
   - "Find jazz labels in my collection"

### 10.3 Release Group Queries

1. **Album Context**
   - "Find reviews for this album"
   - "Get Wikipedia article for this release"
   - "Find streaming links"

2. **Genre Classification**
   - "Show me all electronic albums"
   - "Find rock albums from the 1990s"

---

## 11. Next Steps

### 11.1 Immediate Actions

1. **Create JSON indexes** for common queries (band_members, member_of_bands, label_relations)
2. **Materialize genre table** for fast genre-based lookups
3. **Add URL extraction API** endpoints
4. **Implement graph traversal** for "find connections" queries

### 11.2 Short-Term Enhancements

1. **Build relationship graph table** for efficient network queries
2. **Create FTS indexes** for alias and tag search
3. **Add caching layer** for frequently accessed relationships
4. **Implement URL validator** to check for dead links

### 11.3 Long-Term Improvements

1. **Periodic dump refresh** to get updated relationships
2. **Relationship inference** (e.g., if A is in band B, and C is in B, then A and C are bandmates)
3. **Genre inference** from tags and release groups to artists
4. **Event timeline** integration for concert history
5. **Social graph metrics** (centrality, influence, etc.)

---

## 12. Estimated Query Performance

Without indexes (current state):

- **Find band members**: O(n) table scan - slow (65K rows)
- **Find by genre**: O(n) table scan - slow (65K rows)
- **Find URLs**: O(n) table scan - slow

With recommended indexes:

- **Find band members**: O(1) index lookup - fast
- **Find by genre**: O(log n) index lookup - fast
- **Find URLs**: O(1) index lookup - fast

With denormalized tables:

- **All queries**: O(1) direct lookup - very fast
- **Graph traversal**: O(k) where k = relationship count - optimal

---

## 13. Storage Impact

Current storage:
- `mb_artists`: ~150MB
- `mb_labels`: ~45MB
- `mb_release_groups`: ~180MB
- **Total**: ~375MB

Estimated with recommended indexes: ~+150MB (total ~525MB)
Estimated with denormalized tables: ~+300MB (total ~675MB)

**Recommendation**: Start with JSON indexes only, then add denormalized tables if performance requires.

---

## Conclusion

The MusicBrainz dump data provides a rich foundation for research agent capabilities. The most valuable features for immediate implementation are:

1. **Band member/band lookups** (highest user value)
2. **External URL extraction** (easy integration with other services)
3. **Genre-based discovery** (good metadata coverage)
4. **Label network navigation** (unique relationship data)

Priority should be given to indexing and materializing the most frequently accessed relationships (band members, member_of_bands, genres, URLs) before implementing more complex graph traversal features.

The data quality is high (96%+ coverage) and the URL collection is comprehensive (521K+ URLs across 44 types), making this an excellent resource for augmenting the agent's research capabilities.
