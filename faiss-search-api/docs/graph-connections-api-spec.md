# Graph Connections API Specification

## Overview

Fast API endpoint to power agent graph connection queries. Designed for sub-100ms response times with comprehensive caching.

## Design Principles

1. **Single endpoint, multiple query types** - One `/api/graph/connections` endpoint with `query_type` discriminator
2. **Pre-indexed edge tables** - All queries hit materialized edge tables, no JSON parsing at runtime
3. **Batch-optimized** - Support querying multiple MBIDs in single request
4. **Cache-friendly** - Deterministic results enable aggressive HTTP caching (1 week)

---

## Edge Tables (Current State)

| Table | Rows | Indexed Columns |
|-------|------|-----------------|
| `artist_edges` | 128K | source_mbid, target_mbid, relationship_type, has_vocals, has_guitar, has_bass, has_drums, has_keys |
| `label_edges` | 17K | source_mbid, target_mbid, relationship_type |
| `artist_label_edges` | 7.9K | artist_mbid, label_mbid |
| `artist_work_edges` | 660K | artist_mbid, work_mbid, relationship_type |
| `artist_event_edges` | 108K | artist_mbid, event_id, event_date |
| `recording_work_links` | 60K+ | recording_mbid, work_mbid, is_cover, is_live, is_medley, is_instrumental |
| `artist_area_edges` | 7.5K | artist_mbid, area_mbid, area_name |
| `area_hierarchy` | 239K | child_mbid, parent_mbid, child_name |
| `place_recording_edges` | 2.3M | place_mbid, recording_mbid, area_name |

### Instrument Distribution (artist_edges)
| Instrument | Count |
|------------|-------|
| has_vocals | 7,986 |
| has_guitar | 7,744 |
| has_bass | 5,947 |
| has_drums | 7,353 |
| has_keys | 3,167 |

### Creator Credit Distribution (artist_work_edges)
| Credit Type | Count |
|-------------|-------|
| composer | 353,583 |
| writer | 169,292 |
| lyricist | 116,413 |
| arranger | 10,995 |
| orchestrator | 8,710 |

---

## Python API Models

### Request Model

```python
from typing import Literal, Optional, List
from pydantic import BaseModel, Field

# Query types matching agent use cases
GraphQueryType = Literal[
    "band_members",          # Get members of a band
    "member_of",             # Get bands an artist is member of
    "labelmates",            # Get artists on same label(s)
    "label_hierarchy",       # Get label ownership tree
    "covers",                # Get cover versions of a work
    "artist_origin",         # Get artist's origin area
    "artists_from_area",     # Get artists from an area
    "recorded_at",           # Get recordings made at a place
    "collaborators",         # Get artists who shared bands
    # New queries (Dec 2025)
    "members_by_instrument", # Get band members filtered by instrument
    "works_by_creator",      # Get works composed/written by artist
    "work_credits",          # Get who composed/wrote a work
]

InstrumentFilter = Literal["vocals", "guitar", "bass", "drums", "keys"]
CreatorType = Literal["composer", "lyricist", "writer", "arranger", "orchestrator"]
VersionType = Literal["cover", "live", "medley", "instrumental"]

class GraphConnectionsRequest(BaseModel):
    """Request for graph connections query."""
    query_type: GraphQueryType
    mbids: List[str] = Field(..., min_length=1, max_length=50,
                             description="MusicBrainz IDs to query (max 50)")
    limit: int = Field(default=20, ge=1, le=100)
    include_attributes: bool = Field(default=True,
                                     description="Include instrument/role attributes")
    # Filter parameters for queries
    instrument: Optional[InstrumentFilter] = Field(
        default=None, description="Filter by instrument (for members_by_instrument)")
    creator_type: Optional[CreatorType] = Field(
        default=None, description="Filter by creator type (for works_by_creator)")
    version_type: Optional[VersionType] = Field(
        default=None, description="Filter by version type (for covers): cover, live, medley, instrumental")
```

### Response Models

```python
class ConnectionNode(BaseModel):
    """Single connection result."""
    mbid: str
    name: str
    node_type: Literal["artist", "band", "label", "area", "place", "recording", "work"]
    relationship_type: str
    attributes: Optional[List[str]] = None  # Instruments, roles
    begin_date: Optional[str] = None
    end_date: Optional[str] = None
    via_mbid: Optional[str] = None  # For indirect connections (via label, band)
    via_name: Optional[str] = None

class GraphConnectionsResponse(BaseModel):
    """Response from graph connections query."""
    query_type: GraphQueryType
    source_mbids: List[str]
    connections: List[ConnectionNode]
    total: int
    query_time_ms: float
```

---

## Effect/TypeScript Schemas

### Tool Parameter Schema (JSON Schema compatible)

```typescript
// packages/agent/src/tools/schemas.ts

export const GraphQueryType = Schema.Literal(
  "band_members",
  "member_of",
  "labelmates",
  "label_hierarchy",
  "covers",
  "artist_origin",
  "artists_from_area",
  "recorded_at",
  "collaborators"
)
export type GraphQueryType = typeof GraphQueryType.Type

/**
 * Parameters for graph connections tool
 * NOTE: Plain Schema types for JSON Schema compatibility
 */
export const GraphConnectionsParams = Schema.Struct({
  query_type: GraphQueryType.annotations({
    description: "Type of graph query to execute"
  }),
  mbids: Schema.Array(Schema.String).annotations({
    description: "MusicBrainz IDs to query (1-50)"
  }),
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum results per source MBID (1-100, default 20)"
  }),
  include_attributes: Schema.optional(Schema.Boolean).annotations({
    description: "Include instrument/role attributes (default true)"
  })
})
export type GraphConnectionsParams = typeof GraphConnectionsParams.Type
```

### Response Schema

```typescript
// packages/agent/src/tools/schemas.ts

export const NodeType = Schema.Literal(
  "artist", "band", "label", "area", "place", "recording", "work"
)

export const ConnectionNode = Schema.Struct({
  mbid: Schema.String,
  name: Schema.String,
  node_type: NodeType,
  relationship_type: Schema.String,
  attributes: Schema.NullOr(Schema.Array(Schema.String)),
  begin_date: Schema.NullOr(Schema.String),
  end_date: Schema.NullOr(Schema.String),
  via_mbid: Schema.NullOr(Schema.String),
  via_name: Schema.NullOr(Schema.String)
})
export type ConnectionNode = typeof ConnectionNode.Type

export const GraphConnectionsResponse = Schema.Struct({
  query_type: GraphQueryType,
  source_mbids: Schema.Array(Schema.String),
  connections: Schema.Array(ConnectionNode),
  total: Schema.Number,
  query_time_ms: Schema.Number
})
export type GraphConnectionsResponse = typeof GraphConnectionsResponse.Type
```

---

## SQL Query Implementations

### 1. band_members

```sql
SELECT
    target_mbid as mbid,
    target_name as name,
    'artist' as node_type,
    relationship_type,
    attributes,
    begin_date,
    end_date,
    source_mbid as via_mbid,
    source_name as via_name
FROM artist_edges
WHERE source_mbid IN (?, ?, ...)
  AND relationship_type = 'band_member'
ORDER BY target_name
LIMIT ?
```

### 2. member_of

```sql
SELECT
    target_mbid as mbid,
    target_name as name,
    'band' as node_type,
    relationship_type,
    attributes,
    begin_date,
    end_date,
    NULL as via_mbid,
    NULL as via_name
FROM artist_edges
WHERE source_mbid IN (?, ?, ...)
  AND relationship_type = 'member_of'
ORDER BY target_name
LIMIT ?
```

### 3. labelmates

```sql
-- Find artists who share labels with input artists
WITH source_labels AS (
    SELECT DISTINCT label_mbid, label_name
    FROM artist_label_edges
    WHERE artist_mbid IN (?, ?, ...)
)
SELECT DISTINCT
    ale.artist_mbid as mbid,
    ale.artist_name as name,
    'artist' as node_type,
    'labelmate' as relationship_type,
    NULL as attributes,
    ale.begin_date,
    ale.end_date,
    sl.label_mbid as via_mbid,
    sl.label_name as via_name
FROM artist_label_edges ale
JOIN source_labels sl ON ale.label_mbid = sl.label_mbid
WHERE ale.artist_mbid NOT IN (?, ?, ...)  -- Exclude source artists
ORDER BY ale.artist_name
LIMIT ?
```

### 4. covers

Supports filtering by version type: `cover`, `live`, `medley`, `instrumental`

```sql
-- Find other recordings of the same work(s)
-- Optional: filter by version_type (cover, live, medley, instrumental)
WITH source_works AS (
    SELECT DISTINCT work_mbid, work_title
    FROM recording_work_links
    WHERE recording_mbid IN (?, ?, ...)
)
SELECT DISTINCT
    rwl.recording_mbid as mbid,
    r.song_title as name,
    'recording' as node_type,
    CASE
        WHEN rwl.is_cover = 1 THEN 'cover'
        WHEN rwl.is_live = 1 THEN 'live'
        WHEN rwl.is_medley = 1 THEN 'medley'
        WHEN rwl.is_instrumental = 1 THEN 'instrumental'
        ELSE 'version'
    END as relationship_type,
    rwl.attributes,
    NULL as begin_date,
    NULL as end_date,
    sw.work_mbid as via_mbid,
    sw.work_title as via_name
FROM recording_work_links rwl
JOIN source_works sw ON rwl.work_mbid = sw.work_mbid
LEFT JOIN mb_recordings r ON rwl.recording_mbid = r.recording_mbid
WHERE rwl.recording_mbid NOT IN (?, ?, ...)  -- Exclude source recordings
  AND rwl.is_cover = 1  -- Optional filter: is_live, is_medley, is_instrumental
LIMIT ?
```

### 5. artist_origin

```sql
SELECT
    area_mbid as mbid,
    area_name as name,
    'area' as node_type,
    relationship_type,
    NULL as attributes,
    NULL as begin_date,
    NULL as end_date,
    artist_mbid as via_mbid,
    artist_name as via_name
FROM artist_area_edges
WHERE artist_mbid IN (?, ?, ...)
```

### 6. artists_from_area

```sql
SELECT
    artist_mbid as mbid,
    artist_name as name,
    'artist' as node_type,
    relationship_type,
    NULL as attributes,
    NULL as begin_date,
    NULL as end_date,
    area_mbid as via_mbid,
    area_name as via_name
FROM artist_area_edges
WHERE area_name IN (?, ?, ...)  -- Can query by name for convenience
   OR area_mbid IN (?, ?, ...)
ORDER BY artist_name
LIMIT ?
```

### 7. recorded_at

```sql
SELECT
    recording_mbid as mbid,
    recording_title as name,
    'recording' as node_type,
    relationship_type,
    NULL as attributes,
    begin_date,
    end_date,
    place_mbid as via_mbid,
    place_name as via_name
FROM place_recording_edges
WHERE place_mbid IN (?, ?, ...)
   OR place_name IN (?, ?, ...)  -- Support name queries
ORDER BY recording_title
LIMIT ?
```

### 8. collaborators

```sql
-- Find artists who shared bands with input artist (2-hop via member_of)
WITH source_bands AS (
    SELECT DISTINCT target_mbid as band_mbid, target_name as band_name
    FROM artist_edges
    WHERE source_mbid IN (?, ?, ...)
      AND relationship_type = 'member_of'
)
SELECT DISTINCT
    ae.source_mbid as mbid,
    ae.source_name as name,
    'artist' as node_type,
    'collaborator' as relationship_type,
    ae.attributes,
    ae.begin_date,
    ae.end_date,
    sb.band_mbid as via_mbid,
    sb.band_name as via_name
FROM artist_edges ae
JOIN source_bands sb ON ae.target_mbid = sb.band_mbid
WHERE ae.source_mbid NOT IN (?, ?, ...)  -- Exclude source artists
  AND ae.relationship_type = 'member_of'
ORDER BY ae.source_name
LIMIT ?
```

### 8b. collaborators_direct (NEW)

Supports filtering by collaboration type: `featured`, `production`, `writing`

```sql
-- Find direct artist collaborations (not via shared bands)
-- Relationship types: vocal, instrumental, producer, composer, lyricist, etc.
SELECT DISTINCT
    target_mbid as mbid,
    target_name as name,
    'artist' as node_type,
    relationship_type,
    attributes,
    begin_date,
    end_date,
    source_mbid as via_mbid,
    source_name as via_name
FROM artist_edges
WHERE source_mbid IN (?, ?, ...)
  AND relationship_type NOT IN ('member of band', 'member_of', 'band_member', 'subgroup')
  AND target_type = 'Person'  -- Person-to-person only
  -- Optional: filter by collaboration category
  -- AND relationship_type IN ('vocal', 'instrumental', 'guest')  -- featured
  -- AND relationship_type IN ('producer', 'engineer', 'mix')     -- production
  -- AND relationship_type IN ('composer', 'lyricist', 'arranger') -- writing
ORDER BY target_name
LIMIT ?
```

### 9. members_by_instrument (NEW)

```sql
-- Find band members filtered by instrument (e.g., guitarists in Radiohead)
SELECT
    source_mbid as mbid,
    source_name as name,
    'artist' as node_type,
    relationship_type,
    attributes,
    begin_date,
    end_date,
    target_mbid as via_mbid,
    target_name as via_name
FROM artist_edges
WHERE target_mbid IN (?, ?, ...)  -- Band MBIDs
  AND relationship_type = 'member of band'
  AND has_guitar = 1  -- or has_vocals, has_bass, has_drums, has_keys
ORDER BY source_name
LIMIT ?
```

### 10. works_by_creator (NEW)

```sql
-- Find works composed/written by an artist
SELECT
    work_mbid as mbid,
    work_title as name,
    'work' as node_type,
    relationship_type,  -- composer, lyricist, writer, arranger, etc.
    attributes,
    NULL as begin_date,
    NULL as end_date,
    artist_mbid as via_mbid,
    artist_name as via_name
FROM artist_work_edges
WHERE artist_mbid IN (?, ?, ...)
  AND relationship_type = ?  -- Optional: filter by composer/lyricist/etc.
ORDER BY work_title
LIMIT ?
```

### 11. work_credits (NEW)

```sql
-- Find who composed/wrote a work
SELECT
    artist_mbid as mbid,
    artist_name as name,
    'artist' as node_type,
    relationship_type,  -- composer, lyricist, etc.
    attributes,
    NULL as begin_date,
    NULL as end_date,
    work_mbid as via_mbid,
    work_title as via_name
FROM artist_work_edges
WHERE work_mbid IN (?, ?, ...)
ORDER BY relationship_type, artist_name
LIMIT ?
```

---

## FastAPI Endpoint Implementation

```python
# faiss-search-api/app/routes/graph.py

from fastapi import APIRouter, Depends, HTTPException
from typing import List
import time

from ..models.graph import (
    GraphConnectionsRequest,
    GraphConnectionsResponse,
    ConnectionNode,
    GraphQueryType
)
from ..services.db_service import DatabaseService

router = APIRouter(prefix="/api/graph", tags=["graph"])

# Query implementations mapped by type
QUERY_HANDLERS = {
    "band_members": "_query_band_members",
    "member_of": "_query_member_of",
    "labelmates": "_query_labelmates",
    "covers": "_query_covers",
    "artist_origin": "_query_artist_origin",
    "artists_from_area": "_query_artists_from_area",
    "recorded_at": "_query_recorded_at",
    "collaborators": "_query_collaborators",
    "label_hierarchy": "_query_label_hierarchy",
}

@router.post(
    "/connections",
    response_model=GraphConnectionsResponse,
    summary="Query graph connections",
    description="""
    Query the music knowledge graph for connections.

    **Query Types:**
    - `band_members`: Get members of a band (input: band MBIDs)
    - `member_of`: Get bands an artist is member of (input: artist MBIDs)
    - `labelmates`: Get artists on same label(s) (input: artist MBIDs)
    - `covers`: Get cover versions (input: recording MBIDs)
    - `artist_origin`: Get artist's origin area (input: artist MBIDs)
    - `artists_from_area`: Get artists from area (input: area MBIDs or names)
    - `recorded_at`: Get recordings from place (input: place MBIDs or names)
    - `collaborators`: Get artists who shared bands (input: artist MBIDs)
    - `label_hierarchy`: Get label ownership tree (input: label MBIDs)

    **Caching:** Results cached for 1 week (deterministic data).
    """,
    responses={
        200: {"description": "Connections found"},
        400: {"description": "Invalid query type or MBIDs"},
        500: {"description": "Query failed"}
    }
)
async def query_connections(
    request: GraphConnectionsRequest,
    db: DatabaseService = Depends(get_db_service)
) -> GraphConnectionsResponse:
    """Execute graph connection query."""
    start_time = time.time()

    handler_name = QUERY_HANDLERS.get(request.query_type)
    if not handler_name:
        raise HTTPException(400, f"Unknown query type: {request.query_type}")

    handler = getattr(db, handler_name)
    connections = handler(
        mbids=request.mbids,
        limit=request.limit,
        include_attributes=request.include_attributes
    )

    query_time = (time.time() - start_time) * 1000

    return GraphConnectionsResponse(
        query_type=request.query_type,
        source_mbids=request.mbids,
        connections=connections,
        total=len(connections),
        query_time_ms=query_time
    )
```

---

## DatabaseService Methods

Add to `app/services/db_service.py`:

```python
def _query_band_members(
    self,
    mbids: List[str],
    limit: int = 20,
    include_attributes: bool = True
) -> List[ConnectionNode]:
    """Get band members for given band MBIDs."""
    placeholders = ','.join('?' * len(mbids))

    sql = f"""
        SELECT
            target_mbid, target_name, relationship_type,
            attributes, begin_date, end_date,
            source_mbid, source_name
        FROM artist_edges
        WHERE source_mbid IN ({placeholders})
          AND relationship_type = 'band_member'
        ORDER BY target_name
        LIMIT ?
    """

    cursor = self.conn.cursor()
    cursor.execute(sql, [*mbids, limit])

    return [
        ConnectionNode(
            mbid=row[0],
            name=row[1],
            node_type="artist",
            relationship_type=row[2],
            attributes=json.loads(row[3]) if row[3] and include_attributes else None,
            begin_date=row[4],
            end_date=row[5],
            via_mbid=row[6],
            via_name=row[7]
        )
        for row in cursor.fetchall()
    ]

# ... similar implementations for other query types
```

---

## Agent Tool Definition

```typescript
// packages/agent/src/tools/definitions.ts

export const GraphConnectionsTool = Tool.make("graph_connections", {
  description: `Query the music knowledge graph for connections.

Use this tool to discover relationships between artists, labels, recordings, and places.

**Query Types:**
- band_members: "Who plays in Radiohead?" → members with instruments
- member_of: "What bands was Thom Yorke in?" → bands with roles
- labelmates: "Who else is on Sub Pop?" → artists on same label
- covers: "Who else covered this song?" → other recordings of same work
- artist_origin: "Where is this artist from?" → origin area
- artists_from_area: "Who else is from Seattle?" → artists by location
- recorded_at: "What was recorded at Abbey Road?" → studio recordings
- collaborators: "Who has this artist played with?" → shared band members

Returns structured connection data with MBIDs for follow-up queries.`,
  parameters: GraphConnectionsParams.fields,
  success: GraphConnectionsResponse
})
```

---

## Caching Strategy

```python
# In CacheHeadersMiddleware
CACHE_DURATIONS = {
    # ...existing entries...
    "/api/graph/connections": 604800,  # 1 week - deterministic graph data
}
```

---

## Performance Targets

| Query Type | Expected Time | Index Used |
|------------|---------------|------------|
| band_members | < 10ms | idx_ae_source |
| member_of | < 10ms | idx_ae_source |
| labelmates | < 50ms | idx_ale_artist, idx_ale_label |
| covers | < 50ms | idx_rwl_recording, idx_rwl_work |
| artist_origin | < 5ms | idx_aae_artist |
| artists_from_area | < 20ms | idx_aae_area_name |
| recorded_at | < 100ms | place_recording_edges (2.3M rows) |
| collaborators | < 50ms | idx_ae_source, idx_ae_target |
| members_by_instrument | < 50ms | idx_ae_target, idx_ae_guitar/vocals/etc |
| works_by_creator | < 400ms | idx_awe_artist, idx_awe_type |
| work_credits | < 50ms | idx_awe_work |

---

## Implementation Checklist

### Python Side (faiss-search-api)
- [ ] Create `app/models/graph.py` with Pydantic models
- [ ] Add graph query methods to `app/services/db_service.py`
- [ ] Create `app/routes/graph.py` router
- [ ] Register router in `app/main.py`
- [ ] Add cache headers for `/api/graph/connections`
- [ ] Add indexes if missing (verify with EXPLAIN QUERY PLAN)

### TypeScript Side (packages/agent)
- [ ] Add schemas to `packages/agent/src/tools/schemas.ts`
- [ ] Add tool definition to `packages/agent/src/tools/definitions.ts`
- [ ] Add handler to `packages/agent/src/tools/handlers.ts`
- [ ] Create GraphConnectionsService in `packages/agent/src/services/`
- [ ] Wire FaissClient.graphConnections() method
- [ ] Update CrateToolkit to include GraphConnectionsTool

### Testing
- [ ] Unit tests for each query type
- [ ] Performance benchmarks (must be < 100ms)
- [ ] Integration test with agent

---

## Example Agent Usage

```
User: Tell me about this Fleet Foxes track

Agent thinking:
1. semantic_search("Fleet Foxes") → Get artist MBID
2. graph_connections(query_type="member_of", mbids=["..."]) → Robin Pecknold is member of...
3. graph_connections(query_type="labelmates", mbids=["..."]) → Sub Pop labelmates
4. graph_connections(query_type="artist_origin", mbids=["..."]) → Seattle

Agent output:
"Fleet Foxes is the project of Seattle's Robin Pecknold, who also performs solo.
They're on Sub Pop alongside labelmates Beach House and Father John Misty.
This track was recorded at [studio] and features [band members with instruments]."
```

### New Query Examples (Dec 2025)

```
User: Who plays guitar in Radiohead?

Agent thinking:
1. semantic_search("Radiohead") → Get band MBID
2. graph_connections(query_type="members_by_instrument", mbids=["a74b..."], instrument="guitar")

Result: Jonny Greenwood (electric guitar, original)
```

```
User: What songs did Bach compose?

Agent thinking:
1. semantic_search("Johann Sebastian Bach") → Get artist MBID
2. graph_connections(query_type="works_by_creator", mbids=["24f1..."], creator_type="composer")

Result: 7,843 works including "Erbarme Dich", Brandenburg Concertos, etc.
```

```
User: Who wrote this song?

Agent thinking:
1. Get work MBID from recording via recording_work_links
2. graph_connections(query_type="work_credits", mbids=["work-mbid"])

Result: Composer: John Lennon, Lyricist: Paul McCartney
```

```
User: Are there any live versions of this song?

Agent thinking:
1. Get recording MBID from current play
2. graph_connections(query_type="covers", mbids=["rec-mbid"], version_type="live")

Result: 3 live recordings found - "Hallelujah (Live at Glastonbury)", "Hallelujah (MTV Unplugged)", ...
```

```
User: Who has covered this song?

Agent thinking:
1. Get recording MBID from current play
2. graph_connections(query_type="covers", mbids=["rec-mbid"], version_type="cover")

Result: 47 cover versions found - Jeff Buckley, k.d. lang, Rufus Wainwright, ...
```

```
User: Who has this artist collaborated with?

Agent thinking:
1. Get artist MBID
2. graph_connections(query_type="collaborators_direct", mbids=["artist-mbid"])

Result: Direct collaborations found - featured with Alicia Keys (vocal), produced by Danger Mouse, ...
```

```
User: What producers has this artist worked with?

Agent thinking:
1. Get artist MBID
2. graph_connections(query_type="collaborators_direct", mbids=["artist-mbid"], collaboration_type="production")

Result: Production collaborators - Rick Rubin, Danger Mouse, Nigel Godrich, ...
```
