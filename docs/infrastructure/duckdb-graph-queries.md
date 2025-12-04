# DuckDB Graph Queries for Crate

**Status:** Research & Design
**Date:** 2025-12-03
**Target Environment:** 4GB RAM Digital Ocean Droplet

---

## Executive Summary

DuckDB can serve as an efficient **in-memory graph query engine** for the Crate music research platform, enabling complex artist connection queries, label network traversal, and collaboration discovery **without** deploying a dedicated graph database.

**Key Finding:** DuckDB's `USING KEY` clause provides 1000x memory reduction for graph traversal queries by treating results as updatable dictionaries rather than accumulating all intermediate rows. This makes graph analytics feasible on a 4GB RAM droplet.

### Why DuckDB for Crate?

1. **No new infrastructure** - Runs alongside existing FastAPI service
2. **Memory-efficient graph queries** - USING KEY reduces memory from GBs to MBs
3. **Direct SQLite integration** - Can query SQLite database via `ATTACH`
4. **Rich JSON support** - Native handling of MusicBrainz relations JSON
5. **Zero-copy data access** - No ETL pipeline needed

### Use Cases for Crate

- **Artist connections**: "Who played in the same bands as this artist?"
- **Label networks**: "What labels does Sub Pop own/distribute?"
- **Collaboration discovery**: "Find all artists who collaborated with Flying Lotus"
- **Labelmate discovery**: "Find all artists on Stones Throw Records"
- **Degree of separation**: "How is artist A connected to artist B?"

---

## Memory Management for 4GB Droplet

### DuckDB Memory Configuration

DuckDB defaults to 80% of system RAM, but for a production droplet running FastAPI, we need headroom.

```sql
-- Recommended configuration for 4GB RAM droplet
SET memory_limit = '2GB';        -- 50% of RAM
SET threads = 2;                 -- Limit concurrent threads
SET temp_directory = '/tmp/duckdb';  -- Automatic disk spilling
```

**Memory Allocation:**
- **DuckDB:** 2GB (50%)
- **FastAPI + Python:** 1GB
- **OS + Buffers:** 1GB

### Automatic Disk Spilling

DuckDB automatically spills to disk when queries exceed memory limits:

```sql
-- Enable (default behavior)
SET enable_external_access = true;

-- Monitor spilling
SELECT * FROM duckdb_temporary_files();
```

**Key Benefits:**
- No OOM kills - queries succeed even if data doesn't fit in RAM
- Transparent to application code
- Slower than in-memory, but still functional

### Buffer Manager vs. Operators

**Important:** Some DuckDB operations bypass memory limits:

- **Hash joins** and **hash aggregations** can exceed limits
- **Sorting large datasets** can spike memory
- **Window functions** with large partitions

**Mitigation:**
- Use `USING KEY` for graph queries (avoids accumulation)
- Filter aggressively before joins
- Consider materializing intermediate results for complex queries

---

## USING KEY: The Game-Changer for Graph Queries

### Traditional Recursive CTE Problem

Traditional recursive CTEs accumulate **all intermediate rows**:

```sql
-- ❌ BAD: Accumulates billions of rows for large graphs
WITH RECURSIVE paths(start, node, depth) AS (
    SELECT mbid, mbid, 0 FROM mb_artists WHERE mbid = ?
    UNION ALL
    SELECT p.start, r.target_mbid, p.depth + 1
    FROM paths p
    JOIN artist_relationships r ON p.node = r.source_mbid
    WHERE p.depth < 3
)
SELECT * FROM paths;
```

**Problem:** For a graph with 424 nodes and 1,446 edges:
- Traditional CTE: **1 billion intermediate rows** (GBs of memory)
- Result: OOM or extremely slow

### USING KEY Solution

`USING KEY` treats the recursive table as an **updatable dictionary**:

```sql
-- ✅ GOOD: Only stores current frontier (20K rows)
WITH RECURSIVE paths(start, node, depth) AS (
    SELECT mbid, mbid, 0 FROM mb_artists WHERE mbid = ?
    UNION ALL
    SELECT p.start, r.target_mbid, p.depth + 1
    FROM paths p
    JOIN artist_relationships r ON p.node = r.source_mbid
    WHERE p.depth < 3
) USING KEY(node)  -- 🔑 Treat as updatable dictionary
SELECT * FROM paths;
```

**Result:** 1000x memory reduction - same graph uses only **20K rows**

### How USING KEY Works

```
Traditional CTE:
┌─────────────────────────────────────────────────────┐
│ Iteration 0: [A]                     (1 row)        │
│ Iteration 1: [A→B, A→C]             (3 rows total) │
│ Iteration 2: [A→B→D, A→C→E, ...]   (10 rows total) │
│ Iteration 3: [all paths]           (1B rows total) │
└─────────────────────────────────────────────────────┘

USING KEY:
┌─────────────────────────────────────────────────────┐
│ Frontier 0: {A: 0}                  (1 row)         │
│ Frontier 1: {B: 1, C: 1}           (2 rows)         │
│ Frontier 2: {D: 2, E: 2, ...}      (10 rows)        │
│ Frontier 3: {updated if shorter}   (20 rows)        │
└─────────────────────────────────────────────────────┘
```

**Key Point:** Only current "frontier" nodes are kept in memory.

---

## Crate Schema Analysis

### Current SQLite Schema

From the MusicBrainz data analysis, we have:

**Tables:**
- `mb_artists` (67,664 rows) - with JSON `relations` column
- `mb_labels` (21,822 rows) - with JSON `relations` column
- `mb_releases` (86,262 rows)
- `mb_release_groups` (84,362 rows)
- `mb_recordings` (162,040 rows)
- `fact_plays` (2.2M+ rows)

**Relations Structure (JSON):**

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
  "member_of_bands": [...],
  "collaborators": [],
  "label_relations": [...],
  "urls": {...}
}
```

**Available Relationships:**
- **Band members:** 82,554 relationships across 18,074 artists
- **Member of bands:** 28,777 relationships across 10,609 artists
- **Label relations:** 7,868 relationships across 5,536 artists
- **Label-to-label:** 17,140 relationships across 6,362 labels

---

## Edge Extraction Strategy

To enable graph queries, we need to **extract edges from JSON into flat tables**.

### Option 1: Materialize Edge Tables (Recommended)

Create denormalized edge tables in SQLite for fast lookups:

```sql
-- Artist-to-Artist edges
CREATE TABLE artist_edges (
    source_mbid TEXT NOT NULL,
    target_mbid TEXT NOT NULL,
    relationship_type TEXT NOT NULL,  -- 'band_member', 'member_of', 'collaborator'
    source_name TEXT,
    target_name TEXT,
    attributes TEXT,  -- JSON array: ["vocals", "guitar"]
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (source_mbid, target_mbid, relationship_type)
);

CREATE INDEX idx_artist_edges_source ON artist_edges(source_mbid);
CREATE INDEX idx_artist_edges_target ON artist_edges(target_mbid);
CREATE INDEX idx_artist_edges_type ON artist_edges(relationship_type);

-- Label-to-Label edges
CREATE TABLE label_edges (
    source_mbid TEXT NOT NULL,
    target_mbid TEXT NOT NULL,
    relationship_type TEXT NOT NULL,  -- 'ownership', 'distribution', 'imprint'
    source_name TEXT,
    target_name TEXT,
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (source_mbid, target_mbid, relationship_type)
);

CREATE INDEX idx_label_edges_source ON label_edges(source_mbid);
CREATE INDEX idx_label_edges_target ON label_edges(target_mbid);

-- Artist-to-Label edges
CREATE TABLE artist_label_edges (
    artist_mbid TEXT NOT NULL,
    label_mbid TEXT NOT NULL,
    relationship_type TEXT NOT NULL,  -- 'recording_contract', 'label_founder', etc.
    artist_name TEXT,
    label_name TEXT,
    begin_date TEXT,
    end_date TEXT,
    PRIMARY KEY (artist_mbid, label_mbid, relationship_type)
);

CREATE INDEX idx_artist_label_artist ON artist_label_edges(artist_mbid);
CREATE INDEX idx_artist_label_label ON artist_label_edges(label_mbid);
```

**Population Script:**

```python
# scripts/materialize_graph_edges.py
import sqlite3
import json

def extract_edges(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Extract artist-to-artist edges
    cursor.execute("SELECT artist_mbid, artist_name, relations FROM mb_artists WHERE relations IS NOT NULL")

    for artist_mbid, artist_name, relations_json in cursor:
        relations = json.loads(relations_json)

        # Band members
        for member in relations.get('band_members', []):
            cursor.execute("""
                INSERT OR REPLACE INTO artist_edges
                (source_mbid, target_mbid, relationship_type, source_name, target_name, attributes)
                VALUES (?, ?, 'band_member', ?, ?, ?)
            """, (artist_mbid, member['mbid'], artist_name, member['name'],
                  json.dumps(member.get('attributes', []))))

        # Member of bands
        for band in relations.get('member_of_bands', []):
            cursor.execute("""
                INSERT OR REPLACE INTO artist_edges
                (source_mbid, target_mbid, relationship_type, source_name, target_name, attributes)
                VALUES (?, ?, 'member_of', ?, ?, ?)
            """, (artist_mbid, band['mbid'], artist_name, band['name'],
                  json.dumps(band.get('attributes', []))))

        # Label relations
        for label_rel in relations.get('label_relations', []):
            cursor.execute("""
                INSERT OR REPLACE INTO artist_label_edges
                (artist_mbid, label_mbid, relationship_type, artist_name, label_name)
                VALUES (?, ?, ?, ?, ?)
            """, (artist_mbid, label_rel['mbid'], label_rel['type'],
                  artist_name, label_rel['name']))

    conn.commit()
    conn.close()
```

**Benefits:**
- Fast lookups (indexed)
- No JSON parsing in queries
- Compatible with both SQLite and DuckDB
- ~50MB additional storage for all edges

### Option 2: Query JSON Directly in DuckDB

DuckDB can query JSON directly without materialization:

```sql
-- Extract edges on the fly
SELECT
    artist_mbid as source_mbid,
    json_extract(member, '$.mbid') as target_mbid,
    'band_member' as relationship_type
FROM mb_artists,
     json_each(json_extract(relations, '$.band_members')) as member
WHERE relations IS NOT NULL;
```

**Trade-offs:**
- ❌ Slower (parses JSON every query)
- ❌ Can't use USING KEY efficiently (needs precomputed edges)
- ✅ No schema changes
- ✅ Always up-to-date

**Recommendation:** Use Option 1 (materialize edges) for production.

---

## Example Graph Queries for Crate

### 1. Find Band Members (1-hop)

```sql
-- Find all members of Radiohead
SELECT
    target_mbid,
    target_name,
    attributes
FROM artist_edges
WHERE source_mbid = '${radiohead_mbid}'
  AND relationship_type = 'band_member';
```

### 2. Find Bands an Artist Was In (1-hop)

```sql
-- Find all bands Thom Yorke was in
SELECT
    target_mbid,
    target_name,
    begin_date,
    end_date
FROM artist_edges
WHERE source_mbid = '${thom_yorke_mbid}'
  AND relationship_type = 'member_of';
```

### 3. Find Collaborators (2-hop via shared bands)

```sql
-- Find all artists who were in the same band as Thom Yorke
WITH RECURSIVE collaborators(artist_mbid, artist_name, depth, via_band) AS (
    -- Seed: Start with Thom Yorke
    SELECT
        '${thom_yorke_mbid}',
        'Thom Yorke',
        0,
        NULL

    UNION ALL

    -- Step 1: Find bands Thom was in
    SELECT
        e.target_mbid,
        e.target_name,
        c.depth + 1,
        e.target_mbid
    FROM collaborators c
    JOIN artist_edges e
      ON c.artist_mbid = e.source_mbid
     AND e.relationship_type = 'member_of'
    WHERE c.depth = 0

    UNION ALL

    -- Step 2: Find members of those bands
    SELECT
        e.target_mbid,
        e.target_name,
        c.depth + 1,
        c.via_band
    FROM collaborators c
    JOIN artist_edges e
      ON c.artist_mbid = e.source_mbid
     AND e.relationship_type = 'band_member'
    WHERE c.depth = 1
      AND e.target_mbid != '${thom_yorke_mbid}'  -- Exclude self
) USING KEY(artist_mbid)
SELECT DISTINCT artist_mbid, artist_name, via_band
FROM collaborators
WHERE depth = 2;
```

**Result:** All bandmates of Thom Yorke across all his projects (Radiohead, Atoms for Peace, etc.)

### 4. Find Labelmates

```sql
-- Find all artists on the same label as Kamasi Washington
SELECT DISTINCT
    a2.artist_mbid,
    a2.artist_name,
    ale.label_name
FROM artist_label_edges ale1
JOIN artist_label_edges ale2
  ON ale1.label_mbid = ale2.label_mbid
JOIN mb_artists a2
  ON ale2.artist_mbid = a2.artist_mbid
WHERE ale1.artist_mbid = '${kamasi_mbid}'
  AND ale2.artist_mbid != ale1.artist_mbid
ORDER BY ale.label_name, a2.artist_name;
```

### 5. Label Ownership Chain

```sql
-- Find all labels owned by Universal Music Group (recursively)
WITH RECURSIVE label_tree(label_mbid, label_name, depth, path) AS (
    -- Seed: Universal Music Group
    SELECT
        label_mbid,
        label_name,
        0,
        label_name
    FROM mb_labels
    WHERE label_name = 'Universal Music Group'

    UNION ALL

    -- Recursive: Find owned labels
    SELECT
        le.target_mbid,
        le.target_name,
        lt.depth + 1,
        lt.path || ' → ' || le.target_name
    FROM label_tree lt
    JOIN label_edges le
      ON lt.label_mbid = le.source_mbid
     AND le.relationship_type = 'ownership'
    WHERE lt.depth < 5  -- Prevent infinite recursion
) USING KEY(label_mbid)
SELECT * FROM label_tree
ORDER BY depth, label_name;
```

### 6. Shortest Path Between Artists

```sql
-- Find shortest path from Artist A to Artist B through bands
WITH RECURSIVE paths(start_mbid, current_mbid, current_name, depth, path) AS (
    -- Seed: Start artist
    SELECT
        '${artist_a_mbid}',
        '${artist_a_mbid}',
        'Artist A',
        0,
        'Artist A'

    UNION ALL

    -- Traverse edges
    SELECT
        p.start_mbid,
        e.target_mbid,
        e.target_name,
        p.depth + 1,
        p.path || ' → ' || e.target_name
    FROM paths p
    JOIN artist_edges e
      ON p.current_mbid = e.source_mbid
    WHERE p.depth < 6  -- Max 6 degrees of separation
      AND e.target_mbid != p.start_mbid
) USING KEY(current_mbid)
SELECT * FROM paths
WHERE current_mbid = '${artist_b_mbid}'
ORDER BY depth
LIMIT 1;
```

**Result:** "Artist A → Radiohead → Thom Yorke → Atoms for Peace → Artist B"

### 7. Connected Components (Find Isolated Subgraphs)

```sql
-- Find all connected components in the artist graph
WITH RECURSIVE components(artist_mbid, component_id) AS (
    -- Seed: All artists with their MBID as initial component ID
    SELECT DISTINCT
        source_mbid,
        source_mbid
    FROM artist_edges

    UNION ALL

    -- Propagate minimum component ID
    SELECT
        e.target_mbid,
        CASE
            WHEN e.target_mbid < c.component_id THEN e.target_mbid
            ELSE c.component_id
        END
    FROM components c
    JOIN artist_edges e
      ON c.artist_mbid = e.source_mbid
) USING KEY(artist_mbid)
SELECT
    component_id,
    COUNT(*) as artist_count
FROM components
GROUP BY component_id
ORDER BY artist_count DESC;
```

**Use Case:** "How many isolated artist networks exist in KEXP's play history?"

### 8. PageRank (Most Connected Artists)

```sql
-- Simplified PageRank: Count of distinct connections
SELECT
    source_mbid,
    source_name,
    COUNT(DISTINCT target_mbid) as connection_count
FROM artist_edges
GROUP BY source_mbid, source_name
ORDER BY connection_count DESC
LIMIT 100;
```

**More sophisticated PageRank:**

```sql
WITH RECURSIVE pagerank(artist_mbid, rank, iteration) AS (
    -- Initialize: All artists with rank 1.0
    SELECT DISTINCT
        source_mbid,
        1.0,
        0
    FROM artist_edges

    UNION ALL

    -- Iterative update
    SELECT
        e.target_mbid,
        0.15 + 0.85 * SUM(pr.rank / out_degrees.degree),
        pr.iteration + 1
    FROM pagerank pr
    JOIN artist_edges e
      ON pr.artist_mbid = e.source_mbid
    JOIN (
        SELECT source_mbid, COUNT(*) as degree
        FROM artist_edges
        GROUP BY source_mbid
    ) out_degrees
      ON pr.artist_mbid = out_degrees.source_mbid
    WHERE pr.iteration < 10  -- Limit iterations
    GROUP BY e.target_mbid, pr.iteration
) USING KEY(artist_mbid)
SELECT artist_mbid, rank
FROM pagerank
WHERE iteration = 10
ORDER BY rank DESC
LIMIT 100;
```

---

## DuckDB Integration with FastAPI

### Approach 1: ATTACH SQLite Database

DuckDB can query SQLite directly using `ATTACH`:

```python
# services/graph_query_service.py
import duckdb

class GraphQueryService:
    def __init__(self, sqlite_db_path: str):
        self.conn = duckdb.connect()

        # Configure memory
        self.conn.execute("SET memory_limit = '2GB'")
        self.conn.execute("SET threads = 2")
        self.conn.execute("SET temp_directory = '/tmp/duckdb'")

        # Attach SQLite database
        self.conn.execute(f"ATTACH '{sqlite_db_path}' AS sqlite_db (TYPE SQLITE)")

    def find_band_members(self, artist_mbid: str):
        """Find all band members for an artist."""
        query = """
            SELECT
                target_mbid,
                target_name,
                attributes
            FROM sqlite_db.artist_edges
            WHERE source_mbid = ?
              AND relationship_type = 'band_member'
        """
        return self.conn.execute(query, [artist_mbid]).fetchdf()

    def find_collaborators(self, artist_mbid: str, max_depth: int = 2):
        """Find collaborators via shared bands (2-hop)."""
        query = """
            WITH RECURSIVE collaborators(artist_mbid, artist_name, depth, via_band) AS (
                SELECT
                    ? as artist_mbid,
                    'Seed Artist' as artist_name,
                    0 as depth,
                    NULL as via_band

                UNION ALL

                SELECT
                    e.target_mbid,
                    e.target_name,
                    c.depth + 1,
                    CASE
                        WHEN c.depth = 0 THEN e.target_mbid
                        ELSE c.via_band
                    END
                FROM collaborators c
                JOIN sqlite_db.artist_edges e
                  ON c.artist_mbid = e.source_mbid
                WHERE c.depth < ?
                  AND (
                    (c.depth = 0 AND e.relationship_type = 'member_of')
                    OR (c.depth = 1 AND e.relationship_type = 'band_member')
                  )
            ) USING KEY(artist_mbid)
            SELECT DISTINCT artist_mbid, artist_name, via_band
            FROM collaborators
            WHERE depth = 2
        """
        return self.conn.execute(query, [artist_mbid, max_depth]).fetchdf()

    def find_labelmates(self, artist_mbid: str):
        """Find artists on the same labels."""
        query = """
            SELECT DISTINCT
                ale2.artist_mbid,
                a2.artist_name,
                ale1.label_name
            FROM sqlite_db.artist_label_edges ale1
            JOIN sqlite_db.artist_label_edges ale2
              ON ale1.label_mbid = ale2.label_mbid
            JOIN sqlite_db.mb_artists a2
              ON ale2.artist_mbid = a2.artist_mbid
            WHERE ale1.artist_mbid = ?
              AND ale2.artist_mbid != ale1.artist_mbid
            ORDER BY ale1.label_name, a2.artist_name
        """
        return self.conn.execute(query, [artist_mbid]).fetchdf()

    def find_shortest_path(self, source_mbid: str, target_mbid: str, max_depth: int = 6):
        """Find shortest path between two artists."""
        query = """
            WITH RECURSIVE paths(start_mbid, current_mbid, current_name, depth, path) AS (
                SELECT
                    ? as start_mbid,
                    ? as current_mbid,
                    'Start' as current_name,
                    0 as depth,
                    'Start' as path

                UNION ALL

                SELECT
                    p.start_mbid,
                    e.target_mbid,
                    e.target_name,
                    p.depth + 1,
                    p.path || ' → ' || e.target_name
                FROM paths p
                JOIN sqlite_db.artist_edges e
                  ON p.current_mbid = e.source_mbid
                WHERE p.depth < ?
                  AND e.target_mbid != p.start_mbid
            ) USING KEY(current_mbid)
            SELECT * FROM paths
            WHERE current_mbid = ?
            ORDER BY depth
            LIMIT 1
        """
        return self.conn.execute(query, [source_mbid, source_mbid, max_depth, target_mbid]).fetchdf()
```

**FastAPI Endpoint:**

```python
# routes/graph_routes.py
from fastapi import APIRouter, HTTPException
from services.graph_query_service import GraphQueryService

router = APIRouter(prefix="/api/graph", tags=["graph"])
graph_service = GraphQueryService("/path/to/music_kb.sqlite")

@router.get("/artists/{artist_mbid}/band-members")
async def get_band_members(artist_mbid: str):
    """Get all band members for an artist."""
    try:
        result = graph_service.find_band_members(artist_mbid)
        return result.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/artists/{artist_mbid}/collaborators")
async def get_collaborators(artist_mbid: str, max_depth: int = 2):
    """Find collaborators via shared bands."""
    try:
        result = graph_service.find_collaborators(artist_mbid, max_depth)
        return result.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/artists/{artist_mbid}/labelmates")
async def get_labelmates(artist_mbid: str):
    """Find artists on the same labels."""
    try:
        result = graph_service.find_labelmates(artist_mbid)
        return result.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/artists/{source_mbid}/path-to/{target_mbid}")
async def get_shortest_path(source_mbid: str, target_mbid: str, max_depth: int = 6):
    """Find shortest path between two artists."""
    try:
        result = graph_service.find_shortest_path(source_mbid, target_mbid, max_depth)
        if result.empty:
            raise HTTPException(status_code=404, detail="No path found")
        return result.to_dict(orient="records")[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Approach 2: Load Edge Tables into DuckDB

For better performance, load edge tables into DuckDB memory:

```python
class GraphQueryService:
    def __init__(self, sqlite_db_path: str):
        self.conn = duckdb.connect()
        self.conn.execute("SET memory_limit = '2GB'")

        # Load edge tables into DuckDB
        self.conn.execute(f"""
            CREATE TABLE artist_edges AS
            SELECT * FROM sqlite_scan('{sqlite_db_path}', 'artist_edges')
        """)

        self.conn.execute(f"""
            CREATE TABLE label_edges AS
            SELECT * FROM sqlite_scan('{sqlite_db_path}', 'label_edges')
        """)

        self.conn.execute(f"""
            CREATE TABLE artist_label_edges AS
            SELECT * FROM sqlite_scan('{sqlite_db_path}', 'artist_label_edges')
        """)

        # Create indexes for fast lookups
        self.conn.execute("CREATE INDEX idx_artist_source ON artist_edges(source_mbid)")
        self.conn.execute("CREATE INDEX idx_artist_target ON artist_edges(target_mbid)")
```

**Benefits:**
- Faster queries (no SQLite overhead)
- Can use DuckDB-specific optimizations
- ~50MB RAM for edge tables

**Trade-offs:**
- Longer startup time (loading tables)
- Need to refresh if SQLite data changes

---

## Performance Benchmarks

### Expected Query Times (4GB RAM Droplet)

Assuming 67K artists, 111K relationships:

| Query | Edge Table Size | Memory Usage | Time (USING KEY) | Time (Traditional) |
|-------|-----------------|--------------|------------------|-------------------|
| Band members (1-hop) | 82K edges | < 1MB | < 10ms | < 10ms |
| Collaborators (2-hop) | 82K edges | ~5MB | 50-100ms | 500ms+ |
| Labelmates | 7K edges | < 1MB | 10-20ms | 10-20ms |
| Shortest path (6-hop) | 111K edges | ~20MB | 200-500ms | Timeout |
| Connected components | 111K edges | ~50MB | 1-2s | Timeout |
| PageRank (10 iter) | 111K edges | ~100MB | 5-10s | Timeout |

**Notes:**
- Times assume edge tables materialized
- USING KEY enables queries that would timeout otherwise
- Complex queries (PageRank) may hit memory limits without USING KEY

### Memory Footprint

```
Edge Tables in SQLite: ~50MB
Loaded into DuckDB:    ~80MB (includes indexes)
Query working memory:  ~20-100MB (with USING KEY)
Total DuckDB usage:    ~200MB (well under 2GB limit)
```

**Headroom:** 1.8GB for other queries and spikes.

---

## Limitations and Workarounds

### 1. No Real-Time Updates

**Limitation:** DuckDB operates on a snapshot of the data.

**Workaround:**
- **Option A:** Reload edge tables periodically (e.g., daily cron job)
- **Option B:** Use SQLite for writes, DuckDB for reads (ATTACH mode)
- **Option C:** Trigger DuckDB reload after materialization script runs

```python
# Reload service
def reload_graph_data(self):
    """Reload edge tables from SQLite."""
    self.conn.execute("DROP TABLE IF EXISTS artist_edges")
    self.conn.execute("""
        CREATE TABLE artist_edges AS
        SELECT * FROM sqlite_scan('{self.db_path}', 'artist_edges')
    """)
```

### 2. Complex Temporal Queries

**Limitation:** Begin/end dates for relationships are mostly NULL in current data.

**Workaround:**
- Accept limitation for now
- Add date filtering once MusicBrainz dump provides better date coverage
- Use `WHERE begin_date IS NOT NULL` for partial temporal queries

### 3. Large Result Sets

**Limitation:** Queries returning millions of rows can exhaust memory.

**Workaround:**
- Always use `LIMIT` for user-facing queries
- Use pagination for large results
- Add depth limits to recursive queries (`WHERE depth < N`)

### 4. Concurrent Queries

**Limitation:** Single DuckDB connection is not thread-safe.

**Workaround:**
- Use connection pooling (create multiple DuckDB connections)
- Each request gets its own connection
- Set `threads=2` per connection to avoid oversubscription

```python
from multiprocessing.pool import ThreadPool

class GraphQueryService:
    def __init__(self, sqlite_db_path: str, pool_size: int = 4):
        self.db_path = sqlite_db_path
        self.pool = ThreadPool(pool_size)

    def _get_connection(self):
        """Create a new DuckDB connection per thread."""
        conn = duckdb.connect()
        conn.execute("SET memory_limit = '500MB'")  # 2GB / 4 connections
        conn.execute("SET threads = 2")
        conn.execute(f"ATTACH '{self.db_path}' AS sqlite_db (TYPE SQLITE)")
        return conn
```

### 5. No Built-in Graph Algorithms

**Limitation:** DuckDB is not Neo4j - no built-in Dijkstra, A*, etc.

**Workaround:**
- Implement common algorithms in SQL (as shown above)
- For advanced graph algorithms, export to NetworkX (Python) and process
- Keep queries focused on "discovery" not "analytics"

---

## Deployment Considerations

### Docker Configuration

```dockerfile
# Dockerfile
FROM python:3.11-slim

# Install DuckDB
RUN pip install duckdb fastapi uvicorn

# Create temp directory for spilling
RUN mkdir -p /tmp/duckdb && chmod 777 /tmp/duckdb

# Set environment variables
ENV DUCKDB_MEMORY_LIMIT=2GB
ENV DUCKDB_THREADS=2

COPY . /app
WORKDIR /app

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Health Check

```python
@router.get("/api/graph/health")
async def health_check():
    """Check if graph service is operational."""
    try:
        result = graph_service.conn.execute("SELECT COUNT(*) FROM artist_edges").fetchone()
        return {
            "status": "healthy",
            "edge_count": result[0],
            "memory_limit": graph_service.conn.execute("SELECT current_setting('memory_limit')").fetchone()[0]
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
```

### Monitoring

```python
@router.get("/api/graph/metrics")
async def get_metrics():
    """Get DuckDB query metrics."""
    temp_files = graph_service.conn.execute("SELECT * FROM duckdb_temporary_files()").fetchdf()
    memory_usage = graph_service.conn.execute("SELECT * FROM duckdb_memory()").fetchdf()

    return {
        "temp_files": temp_files.to_dict(orient="records"),
        "memory_usage": memory_usage.to_dict(orient="records")
    }
```

---

## Migration Plan

### Phase 1: Materialize Edge Tables (Week 1)

1. **Create edge table schema** in SQLite
2. **Write extraction script** to parse JSON relations
3. **Populate tables** from existing MusicBrainz data
4. **Create indexes** for fast lookups
5. **Verify data quality** (spot-check relationships)

**Deliverables:**
- `scripts/materialize_graph_edges.py`
- `migrations/003_add_graph_edge_tables.sql`
- Edge tables with ~111K relationships

### Phase 2: Implement DuckDB Service (Week 2)

1. **Install DuckDB** (`pip install duckdb`)
2. **Create GraphQueryService** class
3. **Implement basic queries** (band members, labelmates)
4. **Add FastAPI endpoints**
5. **Write integration tests**

**Deliverables:**
- `services/graph_query_service.py`
- `routes/graph_routes.py`
- API documentation

### Phase 3: Advanced Queries (Week 3)

1. **Implement USING KEY queries** (collaborators, shortest path)
2. **Test memory usage** under load
3. **Add connection pooling**
4. **Optimize slow queries**

**Deliverables:**
- Advanced graph endpoints
- Performance benchmarks
- Memory profiling report

### Phase 4: UI Integration (Week 4)

1. **Create React components** for graph visualization
2. **Add API client methods**
3. **Implement caching** (React Query)
4. **Add loading states**

**Deliverables:**
- Graph browser UI
- Artist connection visualizer

---

## Future Enhancements

### 1. Graph Visualization

Use D3.js or Cytoscape.js to visualize connections:

```javascript
// Example: Visualize 2-hop collaborator network
const response = await fetch(`/api/graph/artists/${mbid}/collaborators?max_depth=2`);
const collaborators = await response.json();

// Render force-directed graph
const nodes = collaborators.map(c => ({ id: c.artist_mbid, label: c.artist_name }));
const edges = collaborators.map(c => ({
  source: mbid,
  target: c.artist_mbid,
  via: c.via_band
}));

renderGraph({ nodes, edges });
```

### 2. Precomputed Metrics

Cache expensive queries as materialized tables:

```sql
-- Create artist connection scores
CREATE TABLE artist_connection_scores AS
SELECT
    source_mbid,
    COUNT(DISTINCT target_mbid) as direct_connections,
    AVG(depth) as avg_separation
FROM (
    -- Compute 3-hop connections
    WITH RECURSIVE paths AS (...)
    SELECT * FROM paths
)
GROUP BY source_mbid;
```

### 3. Genre-Based Graph Filtering

Combine graph queries with genre filters:

```sql
-- Find jazz collaborators only
WITH jazz_artists AS (
    SELECT artist_mbid
    FROM mb_artists
    WHERE genres LIKE '%jazz%'
)
SELECT c.*
FROM collaborators c
JOIN jazz_artists ja ON c.artist_mbid = ja.artist_mbid;
```

### 4. Time-Based Analysis

When temporal data improves:

```sql
-- Find who an artist collaborated with in the 1990s
SELECT * FROM collaborators
WHERE begin_date >= '1990-01-01'
  AND begin_date < '2000-01-01';
```

### 5. Integration with AI Agent

The research agent can use graph queries as tools:

```python
# Agent tool
def find_artist_connections(artist_name: str) -> str:
    """Find interesting connections for an artist."""
    mbid = resolve_mbid(artist_name, "artist")

    # Get band members
    members = graph_service.find_band_members(mbid)

    # Get labelmates
    labelmates = graph_service.find_labelmates(mbid)

    # Format for LLM
    return f"""
    Artist: {artist_name}

    Band Members: {format_members(members)}
    Labelmates: {format_labelmates(labelmates)}
    """
```

---

## Cost-Benefit Analysis

### Benefits

**For Crate:**
1. **No new infrastructure** - Runs in existing FastAPI container
2. **Fast development** - SQL-based, familiar to team
3. **Flexible queries** - Ad-hoc graph exploration without schema changes
4. **Scalable to 100K+ nodes** - USING KEY makes memory manageable
5. **Rich insights** - Power the research agent with connection data

**For Users:**
1. **Discover hidden connections** - "Who collaborated with whom?"
2. **Explore music networks** - Label rosters, band lineups
3. **Contextual recommendations** - "Labelmates of artists you love"

### Costs

1. **Development time:** ~4 weeks (see Migration Plan)
2. **Storage:** +50MB for edge tables (~0.5% increase)
3. **Memory:** ~200MB DuckDB usage (10% of 2GB limit)
4. **Maintenance:** Refresh edges after MusicBrainz sync (automated)

### ROI

**High value, low cost.**

Enables core "crate digging" features (discovering connections, exploring lineage) without deploying Neo4j or GraphQL service. USING KEY makes it feasible on modest hardware.

---

## Conclusion

DuckDB is an **excellent fit** for Crate's graph query needs:

✅ **Memory-efficient** - USING KEY prevents OOM on 4GB RAM
✅ **No new services** - Runs alongside FastAPI
✅ **SQL-based** - Leverages existing skills
✅ **Fast queries** - 10-500ms for most use cases
✅ **Flexible** - Can evolve as data model grows

**Recommendation:** Proceed with Phase 1 (materialize edge tables) and Phase 2 (basic queries). Defer advanced analytics (PageRank, etc.) until user demand validates the need.

---

## References

### DuckDB Documentation

- **Memory Management:** https://duckdb.org/2024/07/09/memory-management
  - Buffer manager, disk spilling, memory limits
- **USING KEY for Graph Queries:** https://duckdb.org/2025/05/23/using-key
  - 1000x memory reduction, shortest path, PageRank
- **SQLite Integration:** https://duckdb.org/docs/extensions/sqlite
  - ATTACH, sqlite_scan()
- **JSON Functions:** https://duckdb.org/docs/data/json/overview
  - json_extract(), json_each()

### Related Crate Docs

- [MusicBrainz Data Analysis](/Users/pooks/Dev/crate/faiss-search-api/docs/reports/musicbrainz-data-analysis.md)
  - Current relationship data structure and statistics
- [Database Schema](/Users/pooks/Dev/crate/faiss-search-api/DATABASE_SCHEMA.md)
  - SQLite schema and table definitions
- [Research Agent Design](/Users/pooks/Dev/crate/docs/plans/2025-12-02-crate-research-agent-design.md)
  - Agent tool interface for graph queries
- [KEXP Crate Philosophy](/Users/pooks/Dev/crate/packages/web/docs/KEXP_CRATE_PHILOSOPHY.md)
  - "Crate digging" ethos - discovering connections and lineage

### External Resources

- **DuckDB Python API:** https://duckdb.org/docs/api/python/overview
- **NetworkX (if needed):** https://networkx.org/documentation/stable/
- **D3.js Force Graph:** https://observablehq.com/@d3/force-directed-graph
- **Cytoscape.js:** https://js.cytoscape.org/

---

**Next Steps:** Create `scripts/materialize_graph_edges.py` and run it to populate edge tables for experimentation.
