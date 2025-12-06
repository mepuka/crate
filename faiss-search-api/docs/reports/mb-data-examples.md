# MusicBrainz Data Examples

This document provides concrete examples of the data structure and query patterns for the MusicBrainz enriched database.

## Example 1: Artist with Rich Connections (Kamasi Washington)

### Basic Info
- **Name**: Kamasi Washington
- **MBID**: (from sample data)
- **Type**: Person

### Band Memberships (member_of_bands)
```json
[
  {
    "mbid": "53732191-7511-466e-b47f-872cb373e623",
    "name": "Gerald Wilson Orchestra",
    "type": "Group",
    "attributes": ["tenor saxophone"]
  },
  {
    "mbid": "7345d55f-8b2c-4471-8727-ec46c9244115",
    "name": "Dinner Party",
    "type": "Group",
    "attributes": []
  },
  {
    "mbid": "9107b827-4ce2-4519-8595-c7e8b8163d05",
    "name": "Throttle Elevator Music",
    "type": "Group",
    "attributes": []
  }
]
```

### External URLs
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
    "https://www.facebook.com/kamasiw",
    "https://www.instagram.com/kamasiwashington/"
  ],
  "wikidata": ["https://www.wikidata.org/wiki/Q16221677"],
  "allmusic": ["https://www.allmusic.com/artist/mn0000772447"],
  "last.fm": ["https://www.last.fm/music/Kamasi+Washington"],
  "soundcloud": ["https://soundcloud.com/kamasiwashington"],
  "youtube": [...],
  "streaming": [
    "https://music.apple.com/us/artist/154076564",
    "https://tidal.com/artist/6289811"
  ]
}
```

## Example 2: Band with Members (Durand Jones & The Indications)

### Basic Info
- **Name**: Durand Jones & The Indications
- **Type**: Group

### Band Members (band_members)
```json
[
  {
    "mbid": "70ed549e-b472-4a73-b5af-4c962976143f",
    "name": "Durand Jones",
    "type": "Person",
    "attributes": []
  }
  // ... more members
]
```

## Example 3: Label with Ownership (Brainfeeder)

### Basic Info
- **Name**: Brainfeeder
- **Type**: Label

### Label Relationships (label_relations)
```json
[
  {
    "mbid": "a3f9cae3-eb80-46aa-8a1d-3538c8c55380",
    "name": "Brainfeeder Records",
    "type": "label ownership",
    "begin": null,
    "end": null
  },
  {
    "mbid": "...",
    "name": "Another Label",
    "type": "label distribution",
    "begin": null,
    "end": null
  }
]
```

## Example 4: Artist with Label Relationships (Marvin Gaye)

### Label Relationships (label_relations)
```json
[
  {
    "mbid": "c9688aac-e22f-49d4-a065-748020fa3d88",
    "name": "MG III Music",
    "type": "personal publisher",
    "begin": null,
    "end": null
  }
]
```

## Example Query Patterns

### 1. Find All Band Members

```sql
SELECT
    artist_name,
    json_extract(relations, '$.band_members') as members
FROM mb_artists
WHERE json_array_length(json_extract(relations, '$.band_members')) > 0;
```

### 2. Find Artists in Multiple Bands

```sql
SELECT
    artist_name,
    json_array_length(json_extract(relations, '$.member_of_bands')) as band_count
FROM mb_artists
WHERE json_array_length(json_extract(relations, '$.member_of_bands')) > 3
ORDER BY band_count DESC;
```

### 3. Find All Bandcamp URLs

```sql
SELECT
    artist_name,
    json_extract(relations, '$.urls.bandcamp') as bandcamp_urls
FROM mb_artists
WHERE json_extract(relations, '$.urls.bandcamp') IS NOT NULL;
```

### 4. Find Artists by Genre

```sql
SELECT
    artist_name,
    genres
FROM mb_artists
WHERE genres LIKE '%jazz%'
    AND genres IS NOT NULL;
```

### 5. Find Label Ownership Chain

```sql
WITH RECURSIVE label_chain AS (
    -- Start with a specific label
    SELECT
        label_mbid,
        label_name,
        relations,
        0 as depth
    FROM mb_labels
    WHERE label_name = 'Brainfeeder'

    UNION ALL

    -- Find parent labels
    SELECT
        l.label_mbid,
        l.label_name,
        l.relations,
        lc.depth + 1
    FROM mb_labels l
    JOIN label_chain lc ON
        json_extract(lc.relations, '$.label_relations') LIKE '%' || l.label_mbid || '%'
    WHERE lc.depth < 5
)
SELECT * FROM label_chain;
```

### 6. Find Common Band Members

```sql
-- Find artists who share band members
SELECT
    a1.artist_name as artist1,
    a2.artist_name as artist2,
    COUNT(*) as common_bands
FROM mb_artists a1
JOIN mb_artists a2 ON a1.artist_mbid < a2.artist_mbid
WHERE EXISTS (
    SELECT 1
    FROM json_each(json_extract(a1.relations, '$.member_of_bands')) j1
    JOIN json_each(json_extract(a2.relations, '$.member_of_bands')) j2
    ON json_extract(j1.value, '$.mbid') = json_extract(j2.value, '$.mbid')
)
GROUP BY a1.artist_mbid, a2.artist_mbid
ORDER BY common_bands DESC
LIMIT 10;
```

### 7. Find All Artists on a Label

```sql
SELECT
    a.artist_name,
    json_extract(lr.value, '$.type') as relationship_type
FROM mb_artists a,
     json_each(json_extract(a.relations, '$.label_relations')) lr
WHERE json_extract(lr.value, '$.name') = 'Brainfeeder'
ORDER BY a.artist_name;
```

### 8. Export All Streaming URLs

```sql
SELECT
    artist_name,
    json_extract(streaming.value, '$') as streaming_url
FROM mb_artists,
     json_each(json_extract(relations, '$.urls.streaming')) streaming
WHERE json_extract(relations, '$.urls.streaming') IS NOT NULL
LIMIT 100;
```

## Graph Traversal Example

### Find "6 Degrees of Separation" Between Artists

```sql
-- Find shortest path between two artists through band memberships
WITH RECURSIVE artist_paths AS (
    -- Start with source artist
    SELECT
        artist_mbid as current_artist,
        artist_name as current_name,
        artist_mbid as path_mbids,
        artist_name as path_names,
        0 as depth
    FROM mb_artists
    WHERE artist_name = 'Kamasi Washington'

    UNION ALL

    -- Follow band relationships
    SELECT
        a.artist_mbid,
        a.artist_name,
        ap.path_mbids || ',' || a.artist_mbid,
        ap.path_names || ' -> ' || a.artist_name,
        ap.depth + 1
    FROM artist_paths ap
    JOIN mb_artists a ON
        -- Join through shared bands
        json_extract(ap.relations, '$.member_of_bands') IS NOT NULL
        AND json_extract(a.relations, '$.member_of_bands') IS NOT NULL
    WHERE ap.depth < 6
        AND ap.path_mbids NOT LIKE '%' || a.artist_mbid || '%'
        AND a.artist_name = 'Target Artist Name'
)
SELECT
    path_names,
    depth
FROM artist_paths
WHERE current_name = 'Target Artist Name'
ORDER BY depth ASC
LIMIT 1;
```

## Data Statistics Queries

### Genre Distribution

```sql
SELECT
    json_extract(g.value, '$') as genre,
    COUNT(*) as count
FROM mb_artists,
     json_each(genres) g
WHERE genres IS NOT NULL
GROUP BY genre
ORDER BY count DESC
LIMIT 20;
```

### URL Type Distribution

```sql
SELECT
    key as url_type,
    SUM(json_array_length(value)) as url_count
FROM mb_artists,
     json_each(json_extract(relations, '$.urls'))
WHERE relations IS NOT NULL
GROUP BY key
ORDER BY url_count DESC;
```

### Relationship Statistics

```sql
SELECT
    'Band Members' as relationship_type,
    COUNT(*) as artists_with_data,
    SUM(json_array_length(json_extract(relations, '$.band_members'))) as total_items
FROM mb_artists
WHERE json_array_length(json_extract(relations, '$.band_members')) > 0

UNION ALL

SELECT
    'Member Of Bands',
    COUNT(*),
    SUM(json_array_length(json_extract(relations, '$.member_of_bands')))
FROM mb_artists
WHERE json_array_length(json_extract(relations, '$.member_of_bands')) > 0

UNION ALL

SELECT
    'Label Relations',
    COUNT(*),
    SUM(json_array_length(json_extract(relations, '$.label_relations')))
FROM mb_artists
WHERE json_array_length(json_extract(relations, '$.label_relations')) > 0;
```

## API Response Examples

### GET /api/artists/:mbid/band-members

**Response**:
```json
{
  "artist": {
    "mbid": "...",
    "name": "Durand Jones & The Indications",
    "type": "Group"
  },
  "band_members": [
    {
      "mbid": "70ed549e-b472-4a73-b5af-4c962976143f",
      "name": "Durand Jones",
      "type": "Person",
      "attributes": ["vocals"],
      "begin": null,
      "end": null
    }
  ],
  "count": 1
}
```

### GET /api/artists/:mbid/urls/bandcamp

**Response**:
```json
{
  "artist": {
    "mbid": "...",
    "name": "Kamasi Washington"
  },
  "url_type": "bandcamp",
  "urls": [
    "https://kamasiwashington.bandcamp.com/"
  ]
}
```

### GET /api/artists/by-genre/jazz

**Response**:
```json
{
  "genre": "jazz",
  "count": 2153,
  "artists": [
    {
      "mbid": "...",
      "name": "Kamasi Washington",
      "genres": ["jazz", "spiritual jazz", "contemporary jazz"],
      "play_count": 42
    },
    // ... more artists
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 2153
  }
}
```

### GET /api/graph/collaborators/:mbid?depth=2

**Response**:
```json
{
  "root_artist": {
    "mbid": "...",
    "name": "Kamasi Washington"
  },
  "graph": {
    "nodes": [
      {
        "mbid": "...",
        "name": "Kamasi Washington",
        "type": "Person",
        "depth": 0
      },
      {
        "mbid": "53732191-7511-466e-b47f-872cb373e623",
        "name": "Gerald Wilson Orchestra",
        "type": "Group",
        "depth": 1
      }
      // ... more nodes
    ],
    "edges": [
      {
        "source": "...",
        "target": "53732191-7511-466e-b47f-872cb373e623",
        "relationship": "member_of_bands",
        "attributes": ["tenor saxophone"]
      }
      // ... more edges
    ]
  },
  "stats": {
    "total_nodes": 15,
    "total_edges": 23,
    "max_depth": 2
  }
}
```
