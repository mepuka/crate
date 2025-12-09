# Hybrid Search Implementation Plan: FTS5 + FAISS with RRF

**Date:** 2025-12-09
**Status:** Ready for Implementation
**Constraint:** 4GB RAM droplet, FAISS index is mmap read-only

## Problem Statement

The FAISS semantic search excels at conceptual queries ("upbeat jazz fusion") but struggles with exact matches (artist names, track titles). New plays (2,131 unembedded) aren't searchable via FAISS due to read-only index constraint. We need hybrid search combining:

1. **FTS5 (BM25)** - Exact/keyword matching on artist, song, album, comment
2. **FAISS** - Semantic similarity from embeddings
3. **RRF** - Reciprocal Rank Fusion to merge results without normalization

## Architecture Decision

**Use SQLite FTS5 instead of rank_bm25 Python library:**

| Aspect | FTS5 (SQLite) | rank_bm25 (Python) |
|--------|---------------|-------------------|
| Memory | Zero (disk-based) | ~50MB+ for 130k plays |
| Persistence | Automatic | Requires rebuild on restart |
| Performance | Optimized C implementation | Pure Python |
| Incremental | Built-in triggers | Manual rebuild |
| Integration | SQL queries | Python objects |

FTS5 wins on all dimensions for our 4GB droplet constraint.

## RRF Algorithm

Reciprocal Rank Fusion elegantly handles different score scales:

```
RRF_score(d) = Σ 1 / (k + rank_i(d))
```

Where:
- `k = 60` (standard constant, prevents over-weighting top results)
- `rank_i(d)` = position of document d in result list i (1-indexed)
- Documents only in one list still contribute their rank

**Example:**
- Document appears at rank 1 in BM25, rank 3 in FAISS
- Score = 1/(60+1) + 1/(60+3) = 0.0164 + 0.0159 = 0.0323
- Document only in BM25 at rank 1: Score = 1/61 = 0.0164

**Benefits:**
- No normalization needed (unlike linear combination)
- Handles different score scales automatically
- Robust to missing results in one system

## Implementation Tasks

### Phase 1: FTS5 Virtual Table (Backend)

#### Task 1.1: Create FTS5 Migration
**File:** `faiss-search-api/migrations/004_add_fts5_plays.sql`

```sql
-- Create FTS5 virtual table for play search
-- Uses porter stemmer for English word matching
CREATE VIRTUAL TABLE IF NOT EXISTS plays_fts USING fts5(
    artist,
    song,
    album,
    comment,
    content='fact_plays',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Populate from existing data
INSERT INTO plays_fts(rowid, artist, song, album, comment)
SELECT id,
       COALESCE(artist, ''),
       COALESCE(song, ''),
       COALESCE(album, ''),
       COALESCE(comment, '')
FROM fact_plays;

-- Triggers to keep FTS5 in sync
CREATE TRIGGER IF NOT EXISTS plays_fts_insert AFTER INSERT ON fact_plays BEGIN
    INSERT INTO plays_fts(rowid, artist, song, album, comment)
    VALUES (NEW.id,
            COALESCE(NEW.artist, ''),
            COALESCE(NEW.song, ''),
            COALESCE(NEW.album, ''),
            COALESCE(NEW.comment, ''));
END;

CREATE TRIGGER IF NOT EXISTS plays_fts_delete AFTER DELETE ON fact_plays BEGIN
    INSERT INTO plays_fts(plays_fts, rowid, artist, song, album, comment)
    VALUES ('delete', OLD.id,
            COALESCE(OLD.artist, ''),
            COALESCE(OLD.song, ''),
            COALESCE(OLD.album, ''),
            COALESCE(OLD.comment, ''));
END;

CREATE TRIGGER IF NOT EXISTS plays_fts_update AFTER UPDATE ON fact_plays BEGIN
    INSERT INTO plays_fts(plays_fts, rowid, artist, song, album, comment)
    VALUES ('delete', OLD.id,
            COALESCE(OLD.artist, ''),
            COALESCE(OLD.song, ''),
            COALESCE(OLD.album, ''),
            COALESCE(OLD.comment, ''));
    INSERT INTO plays_fts(rowid, artist, song, album, comment)
    VALUES (NEW.id,
            COALESCE(NEW.artist, ''),
            COALESCE(NEW.song, ''),
            COALESCE(NEW.album, ''),
            COALESCE(NEW.comment, ''));
END;
```

**Verification:**
```sql
-- Should return count ~130,000
SELECT COUNT(*) FROM plays_fts;

-- Test search
SELECT rowid, artist, song, bm25(plays_fts) as score
FROM plays_fts
WHERE plays_fts MATCH 'radiohead'
ORDER BY score
LIMIT 5;
```

#### Task 1.2: Add FTS5 Query Methods to DatabaseService
**File:** `faiss-search-api/app/services/db_service.py`

Add method after line ~700:

```python
def fts5_search(
    self,
    query: str,
    limit: int = 100,
    columns: Optional[List[str]] = None
) -> List[Tuple[int, float]]:
    """
    Search plays using FTS5 full-text search.

    Args:
        query: Search query (FTS5 syntax supported)
        limit: Maximum results to return
        columns: Specific columns to search (default: all)

    Returns:
        List of (play_id, bm25_score) tuples, sorted by relevance.
        Note: BM25 scores are negative (more negative = better match).
    """
    cursor = self.conn.cursor()

    # Escape query for FTS5 (handle special characters)
    # FTS5 operators: AND OR NOT * ^ NEAR
    safe_query = query.replace('"', '""')

    # Build column filter if specified
    if columns:
        # Use column filter syntax: {col1 col2}: query
        col_prefix = f"{{{' '.join(columns)}}}: "
        fts_query = f'{col_prefix}"{safe_query}"'
    else:
        fts_query = f'"{safe_query}"'

    try:
        cursor.execute("""
            SELECT rowid, bm25(plays_fts) as score
            FROM plays_fts
            WHERE plays_fts MATCH ?
            ORDER BY score
            LIMIT ?
        """, (fts_query, limit))

        return [(row[0], row[1]) for row in cursor.fetchall()]
    except sqlite3.OperationalError as e:
        logger.warning(f"FTS5 search failed for query '{query}': {e}")
        return []

def check_fts5_available(self) -> bool:
    """Check if FTS5 table exists and is populated."""
    cursor = self.conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM plays_fts")
        count = cursor.fetchone()[0]
        return count > 0
    except sqlite3.OperationalError:
        return False
```

### Phase 2: HybridSearchService Implementation

#### Task 2.1: Create HybridSearchService
**File:** `faiss-search-api/app/services/hybrid_search_service.py`

```python
"""Hybrid search service combining FTS5 and FAISS with RRF."""
import logging
from dataclasses import dataclass
from typing import List, Optional, Dict, Tuple

logger = logging.getLogger(__name__)


@dataclass
class HybridResult:
    """Single result from hybrid search."""
    play_id: int
    rrf_score: float
    bm25_rank: Optional[int] = None
    faiss_rank: Optional[int] = None
    faiss_score: Optional[float] = None


class HybridSearchService:
    """
    Hybrid search combining FTS5 (BM25) and FAISS with RRF fusion.

    Uses Reciprocal Rank Fusion to merge results:
    RRF(d) = Σ 1/(k + rank_i(d)) where k=60
    """

    RRF_K = 60  # Standard RRF constant

    def __init__(self, db_service, search_service):
        """
        Initialize hybrid search service.

        Args:
            db_service: DatabaseService instance (for FTS5 queries)
            search_service: SearchService instance (for FAISS queries)
        """
        self.db = db_service
        self.faiss = search_service
        self._fts5_available: Optional[bool] = None

    @property
    def fts5_available(self) -> bool:
        """Check if FTS5 is available (cached)."""
        if self._fts5_available is None:
            self._fts5_available = self.db.check_fts5_available()
            if self._fts5_available:
                logger.info("FTS5 hybrid search enabled")
            else:
                logger.warning("FTS5 not available - hybrid search will use FAISS only")
        return self._fts5_available

    def search(
        self,
        query: str,
        k: int = 50,
        bm25_weight: float = 0.5,
        faiss_weight: float = 0.5,
        use_expansion: bool = True
    ) -> List[HybridResult]:
        """
        Perform hybrid search with RRF fusion.

        Args:
            query: Search query text
            k: Number of results to return
            bm25_weight: Weight for BM25 (0-1, 0 = disabled)
            faiss_weight: Weight for FAISS (0-1, 0 = disabled)
            use_expansion: Apply query expansion (unused for now)

        Returns:
            List of HybridResult sorted by RRF score (descending)
        """
        # Over-fetch from each system for good RRF overlap
        fetch_k = min(k * 2, 200)

        bm25_results: Dict[int, int] = {}  # play_id -> rank
        faiss_results: Dict[int, Tuple[int, float]] = {}  # play_id -> (rank, score)

        # FTS5 search (if enabled and weighted)
        if bm25_weight > 0 and self.fts5_available:
            fts_results = self.db.fts5_search(query, limit=fetch_k)
            for rank, (play_id, _score) in enumerate(fts_results, start=1):
                bm25_results[play_id] = rank

        # FAISS search (if enabled and weighted)
        if faiss_weight > 0:
            try:
                faiss_hits = self.faiss.search(query, k=fetch_k)
                for rank, (play_id, score) in enumerate(faiss_hits, start=1):
                    faiss_results[play_id] = (rank, score)
            except Exception as e:
                logger.warning(f"FAISS search failed: {e}")

        # Merge with weighted RRF
        all_play_ids = set(bm25_results.keys()) | set(faiss_results.keys())

        results: List[HybridResult] = []
        for play_id in all_play_ids:
            rrf_score = 0.0
            bm25_rank = bm25_results.get(play_id)
            faiss_data = faiss_results.get(play_id)
            faiss_rank = faiss_data[0] if faiss_data else None
            faiss_score = faiss_data[1] if faiss_data else None

            # Weighted RRF contribution
            if bm25_rank is not None:
                rrf_score += bm25_weight * (1.0 / (self.RRF_K + bm25_rank))
            if faiss_rank is not None:
                rrf_score += faiss_weight * (1.0 / (self.RRF_K + faiss_rank))

            results.append(HybridResult(
                play_id=play_id,
                rrf_score=rrf_score,
                bm25_rank=bm25_rank,
                faiss_rank=faiss_rank,
                faiss_score=faiss_score
            ))

        # Sort by RRF score descending, take top k
        results.sort(key=lambda r: r.rrf_score, reverse=True)
        return results[:k]
```

#### Task 2.2: Wire Up HybridSearchService in main.py
**File:** `faiss-search-api/app/main.py`

Update imports (around line 20):
```python
from .services.hybrid_search_service import HybridSearchService
```

Update initialization in `lifespan()` (around line 80-100):
```python
# Initialize hybrid search service
global hybrid_search_service
hybrid_search_service = HybridSearchService(
    db_service=db_service,
    search_service=search_service
)
logger.info(f"Hybrid search initialized (FTS5: {hybrid_search_service.fts5_available})")
```

Update `get_hybrid_search_service()` dependency (around line 268):
```python
def get_hybrid_search_service() -> HybridSearchService:
    """Get hybrid search service dependency."""
    if hybrid_search_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Hybrid search service not initialized"
        )
    return hybrid_search_service
```

### Phase 3: Agent Tool Integration

#### Task 3.1: Add HybridSearchParams and Response Schemas
**File:** `packages/agent/src/tools/schemas.ts`

Add after SemanticSearchResponse (around line 180):

```typescript
// =============================================================================
// HybridSearch Tool Schemas
// =============================================================================

/**
 * Parameters for hybrid search (FTS5 + FAISS)
 */
export const HybridSearchParams = Schema.Struct({
  /** Search query text */
  query: Schema.String.annotations({
    description: "Search query - works for exact names AND semantic concepts"
  }),
  /** Maximum results (default 20, max 100) */
  limit: Schema.optional(Schema.Number).annotations({
    description: "Maximum results to return (default 20, max 100)"
  }),
  /** BM25 weight 0-1 (default 0.5) */
  bm25_weight: Schema.optional(Schema.Number).annotations({
    description: "Weight for keyword/exact matching (0-1, default 0.5)"
  }),
  /** FAISS weight 0-1 (default 0.5) */
  faiss_weight: Schema.optional(Schema.Number).annotations({
    description: "Weight for semantic similarity (0-1, default 0.5)"
  })
})
export type HybridSearchParams = typeof HybridSearchParams.Type

/**
 * Hybrid search result with ranking info
 */
export const HybridPlayResult = Schema.Struct({
  id: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  rrf_score: Schema.Number,
  bm25_rank: Schema.NullOr(Schema.Number),
  faiss_rank: Schema.NullOr(Schema.Number),
  faiss_score: Schema.NullOr(Schema.Number),
  album: Schema.NullOr(Schema.String),
  airdate: Schema.String,
  labels: Schema.Array(Schema.String),
  comment: Schema.NullOr(Schema.String),
  artist_mbid: Schema.Array(Schema.String),
  recording_mbid: Schema.NullOr(Schema.String),
  release_mbid: Schema.NullOr(Schema.String),
  release_group_mbid: Schema.NullOr(Schema.String)
})
export type HybridPlayResult = typeof HybridPlayResult.Type

/**
 * Hybrid search response
 */
export const HybridSearchResponse = Schema.Struct({
  results: Schema.Array(HybridPlayResult),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String,
  bm25_weight: Schema.Number,
  faiss_weight: Schema.Number,
  _error: Schema.optional(Schema.String)
})
export type HybridSearchResponse = typeof HybridSearchResponse.Type
```

#### Task 3.2: Add HybridSearchTool Definition
**File:** `packages/agent/src/tools/definitions.ts`

Add import:
```typescript
import {
  // ... existing imports ...
  HybridSearchParams,
  HybridSearchResponse,
} from "./schemas.js";
```

Add tool definition after SemanticSearchTool:
```typescript
/**
 * Hybrid search combining keywords and semantic similarity
 */
export const HybridSearchTool = Tool.make("hybrid_search", {
  description: `Search KEXP plays using BOTH keyword matching AND semantic similarity.

**RECOMMENDED for most searches** - combines the best of both approaches:
- Exact matches: Artist names, song titles, DJ comments → BM25 excels
- Conceptual queries: Mood, style, related concepts → FAISS excels
- Combined: "Fleet Foxes" finds exact artist + semantically similar folk artists

**When to use each:**
- hybrid_search (default): Best for most queries, especially artist/song names
- semantic_search: Pure conceptual queries like "upbeat summer vibes"

**Weights (0-1):**
- bm25_weight=0.7, faiss_weight=0.3 for known artist/song names
- bm25_weight=0.3, faiss_weight=0.7 for mood/style queries
- Default 0.5/0.5 is a good balance

Returns results ranked by Reciprocal Rank Fusion (RRF) score.
Includes bm25_rank and faiss_rank to show which system contributed.`,
  parameters: HybridSearchParams.fields,
  success: HybridSearchResponse,
  failureMode: "return",
});
```

Add to CrateToolkit:
```typescript
export const CrateToolkit = Toolkit.make(
  SearchPlaysTool,
  SemanticSearchTool,
  HybridSearchTool,  // ADD THIS
  ResolveMbidTool,
  // ...
);
```

#### Task 3.3: Add HybridSearch Handler
**File:** `packages/agent/src/tools/handlers.ts`

Add handler implementation following existing patterns:

```typescript
// Add import
import { HybridSearchTool, HybridSearchToolType } from "./definitions.js";

// Add handler
export const handleHybridSearch = (
  faissClient: FaissClientInterface
): Tool.Handler<HybridSearchToolType> =>
  Effect.gen(function* () {
    return (params) =>
      Effect.gen(function* () {
        const result = yield* faissClient.hybridSearch({
          query: params.query,
          limit: params.limit ?? 20,
          bm25_weight: params.bm25_weight ?? 0.5,
          faiss_weight: params.faiss_weight ?? 0.5,
        }).pipe(
          Effect.withSpan("tool.hybrid_search", {
            attributes: { query: params.query }
          })
        );

        return result;
      });
  });
```

#### Task 3.4: Add hybridSearch to FaissClient
**File:** `packages/agent/src/FaissClient.ts`

Add method to interface and implementation:

```typescript
// In FaissClientInterface
readonly hybridSearch: (params: {
  query: string;
  limit?: number;
  bm25_weight?: number;
  faiss_weight?: number;
}) => Effect.Effect<HybridSearchResponse, FaissApiError>;

// In implementation
hybridSearch: (params) =>
  Effect.gen(function* () {
    const response = yield* client
      .post("/api/search/hybrid", {
        body: HttpBody.json({
          query: params.query,
          limit: params.limit ?? 20,
          bm25_weight: params.bm25_weight ?? 0.5,
          faiss_weight: params.faiss_weight ?? 0.5,
          use_expansion: false,
        }),
      })
      .pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(HybridSearchResponseSchema)),
        Effect.mapError(
          (error) =>
            new FaissApiError({
              message: `Hybrid search failed: ${error}`,
              cause: error,
            })
        ),
        Effect.catchAll((error) =>
          Effect.succeed({
            results: [],
            total: 0,
            query_time_ms: 0,
            query: params.query,
            bm25_weight: params.bm25_weight ?? 0.5,
            faiss_weight: params.faiss_weight ?? 0.5,
            _error: String(error),
          })
        )
      );
    return response;
  }),
```

### Phase 4: Deployment

#### Task 4.1: Run FTS5 Migration on Droplet

```bash
ssh root@cratemusic.duckdns.org "
  docker exec kexp-search-api python -c \"
import sqlite3
conn = sqlite3.connect('/app/data/music_kb.sqlite')
cursor = conn.cursor()

# Create FTS5 table
cursor.executescript('''
CREATE VIRTUAL TABLE IF NOT EXISTS plays_fts USING fts5(
    artist, song, album, comment,
    content=fact_plays, content_rowid=id,
    tokenize=porter unicode61
);

INSERT INTO plays_fts(rowid, artist, song, album, comment)
SELECT id, COALESCE(artist,''), COALESCE(song,''), COALESCE(album,''), COALESCE(comment,'')
FROM fact_plays
WHERE NOT EXISTS (SELECT 1 FROM plays_fts LIMIT 1);
''')

# Create triggers
cursor.executescript('''
CREATE TRIGGER IF NOT EXISTS plays_fts_insert AFTER INSERT ON fact_plays BEGIN
    INSERT INTO plays_fts(rowid, artist, song, album, comment)
    VALUES (NEW.id, COALESCE(NEW.artist,''), COALESCE(NEW.song,''), COALESCE(NEW.album,''), COALESCE(NEW.comment,''));
END;

CREATE TRIGGER IF NOT EXISTS plays_fts_delete AFTER DELETE ON fact_plays BEGIN
    INSERT INTO plays_fts(plays_fts, rowid, artist, song, album, comment)
    VALUES ('delete', OLD.id, COALESCE(OLD.artist,''), COALESCE(OLD.song,''), COALESCE(OLD.album,''), COALESCE(OLD.comment,''));
END;
''')

conn.commit()
print(f'FTS5 rows: {cursor.execute(\"SELECT COUNT(*) FROM plays_fts\").fetchone()[0]}')
\"
"
```

#### Task 4.2: Deploy Updated FAISS API

```bash
cd faiss-search-api && ./scripts/deploy_to_droplet.sh --app-only
```

#### Task 4.3: Verify Hybrid Search Endpoint

```bash
curl -X POST https://cratemusic.duckdns.org/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"query": "Radiohead", "limit": 5}'
```

Expected: Results with rrf_score, bm25_rank, faiss_rank populated.

### Phase 5: System Prompt Update

#### Task 5.1: Update System Prompt for Hybrid Search
**File:** `packages/agent/src/prompts/system-prompt.ts`

Add to search guidance section:

```typescript
## Search Tool Selection

**hybrid_search** (RECOMMENDED for most queries)
- Best for artist names, song titles, album names
- Combines exact keyword matching with semantic similarity
- Use bm25_weight=0.7 for known names, 0.3 for conceptual queries
- Example: "Fleet Foxes" → finds exact matches + similar folk artists

**semantic_search** (for pure conceptual queries)
- Best for mood, style, and abstract concepts
- Example: "melancholic indie folk with harmonies"
- Returns plays ranked purely by embedding similarity

**search_plays** (for MBID-based lookup)
- Use after finding MBIDs from other searches
- Filters timeline by artist/recording/release MBIDs
```

## Testing Checklist

- [ ] FTS5 table created with ~130k rows
- [ ] Triggers fire on sync_plays inserts
- [ ] BM25 search returns results for "Radiohead"
- [ ] FAISS search still works independently
- [ ] Hybrid endpoint returns merged results
- [ ] RRF scores are reasonable (0.01-0.05 range)
- [ ] Agent can call hybrid_search tool
- [ ] Memory usage stable on droplet

## Rollback Plan

If issues arise:
1. Set `bm25_weight=0` in requests to disable FTS5
2. FTS5 table can be dropped: `DROP TABLE plays_fts`
3. Triggers can be dropped: `DROP TRIGGER plays_fts_*`
4. FAISS-only search remains functional

## Memory Impact

- FTS5 index: ~30-50MB on disk, minimal RAM (SQLite pages)
- No Python BM25 object: Saves ~50MB RAM
- Total impact: Near-zero additional RAM usage
