# Unified Insight Schema Alignment Plan

**Date:** 2025-12-02
**Status:** Ready for Implementation
**Priority:** Critical - Blocks Agent Integration

## Executive Summary

The Crate Research Agent produces typed `Insight` objects but the Python API stores them as untyped JSON blobs via `EnrichmentItem`. This document provides a comprehensive plan to align schemas across TypeScript agent, Python API, and database storage.

## Problem Analysis

### Current Misalignments

| Layer | Current State | Problem |
|-------|---------------|---------|
| **Agent Output** | Typed `Insight` union (Concert, Cover, Sample, etc.) | Well-designed, source of truth |
| **Python API** | `EnrichmentItem { play_id, data: dict }` | No validation, loses type safety |
| **Database** | `enrichments` table with JSON blob | No MBID indexing, can't query by entity |
| **InsightSummary** | Two incompatible definitions | Breaks prompt context formatting |

### InsightSummary Dual Definition Issue

**tools/schemas.ts (snake_case):**
```typescript
{
  id, play_id, artist, track, insight_type,
  summary, created_at, entity_mbids
}
```

**prompts/system-prompt.ts (camelCase):**
```typescript
{
  _tag, playId, entityMbids, summary
}
```

**Impact:** `formatRecentInsights()` can't access `artist`, `track`, `created_at` fields.

## Solution Architecture

### Design Decisions

1. **Single Source of Truth:** `tools/schemas.ts` owns `InsightSummary` (snake_case for API alignment)
2. **Typed API:** Replace generic `/api/enrichments` with typed `/api/insights`
3. **Indexed Storage:** New `insights` table with denormalized MBID columns
4. **Discriminated Union:** Preserve `_tag` pattern across TypeScript and Python

### Data Flow (Target State)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Agent (TypeScript)                                                       │
│ ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐ │
│ │ Insight Union   │ -> │ InsightRequest   │ -> │ POST /api/insights  │ │
│ │ (discriminated) │    │ (typed payload)  │    │ (Effect HttpClient) │ │
│ └─────────────────┘    └──────────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Python API (FastAPI)                                                     │
│ ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐ │
│ │ Pydantic Union  │ -> │ Validation +     │ -> │ insights table      │ │
│ │ (discriminated) │    │ MBID extraction  │    │ (indexed columns)   │ │
│ └─────────────────┘    └──────────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Fix InsightSummary Alignment (Immediate)

**Goal:** Single canonical `InsightSummary` definition

**Files to modify:**
- `packages/agent/src/prompts/system-prompt.ts`
- `packages/agent/src/prompts/index.ts`

**Changes:**

1. Remove local `InsightSummary` interface from `system-prompt.ts` (lines 406-411)
2. Import canonical definition: `import type { InsightSummary } from "../tools/schemas.js"`
3. Update `formatRecentInsights()` to use snake_case field names:
   - `insight.play_id` instead of `insight.playId`
   - `insight.insight_type` instead of `insight._tag`
   - `insight.entity_mbids` instead of `insight.entityMbids`

**Effort:** ~30 minutes

---

### Phase 2: Database Schema (Foundation)

**Goal:** New `insights` table with proper indexing

**File:** `faiss-search-api/migrations/003_add_insights.sql`

```sql
-- Insights table with MBID indexing
CREATE TABLE insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Type discriminator
    insight_type TEXT NOT NULL CHECK (insight_type IN (
        'Concert', 'Cover', 'Sample', 'PlayHistory', 'Connection', 'Link'
    )),

    -- Source play
    play_id INTEGER NOT NULL REFERENCES fact_plays(id) ON DELETE CASCADE,

    -- Classification
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    source_type TEXT NOT NULL CHECK (source_type IN ('extraction', 'database', 'external')),

    -- Denormalized source MBIDs for indexing
    source_recording_mbid TEXT,
    source_release_mbid TEXT,

    -- Denormalized referenced MBIDs for entity page queries
    referenced_artist_mbid TEXT,
    referenced_recording_mbid TEXT,
    referenced_release_mbid TEXT,
    referenced_label_mbid TEXT,

    -- Full insight data (typed JSON)
    data JSON NOT NULL,

    -- Soft delete
    deleted_at TEXT,

    -- Timestamps
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Primary indexes
CREATE INDEX idx_insights_play_id ON insights(play_id);
CREATE INDEX idx_insights_type ON insights(insight_type);
CREATE INDEX idx_insights_created_at ON insights(created_at);

-- MBID indexes for entity pages
CREATE INDEX idx_insights_ref_artist ON insights(referenced_artist_mbid)
    WHERE referenced_artist_mbid IS NOT NULL;
CREATE INDEX idx_insights_ref_recording ON insights(referenced_recording_mbid)
    WHERE referenced_recording_mbid IS NOT NULL;
CREATE INDEX idx_insights_ref_release ON insights(referenced_release_mbid)
    WHERE referenced_release_mbid IS NOT NULL;

-- Source artist MBIDs junction table (for array queries)
CREATE TABLE insight_source_artists (
    insight_id INTEGER NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    artist_mbid TEXT NOT NULL,
    PRIMARY KEY (insight_id, artist_mbid)
);
CREATE INDEX idx_insight_source_artists ON insight_source_artists(artist_mbid);

-- View for active insights
CREATE VIEW v_active_insights AS
SELECT * FROM insights WHERE deleted_at IS NULL;
```

**Effort:** ~1 hour

---

### Phase 3: Python API Models

**Goal:** Typed Pydantic models with discriminated union

**File:** `faiss-search-api/app/models/insights.py` (new file)

**Key Models:**

```python
from typing import Literal, Optional, List, Union, Annotated
from pydantic import BaseModel, Field

# Base fields shared by all insights
class BaseInsight(BaseModel):
    play_id: int = Field(..., alias="playId")
    source_recording_mbid: Optional[str] = Field(None, alias="sourceRecordingMbid")
    source_artist_mbids: List[str] = Field(default_factory=list, alias="sourceArtistMbids")
    source_release_mbid: Optional[str] = Field(None, alias="sourceReleaseMbid")
    confidence: Literal["high", "medium", "low"]
    source_type: Literal["extraction", "database", "external"] = Field(..., alias="sourceType")

# Example: ConcertInsight
class ConcertInsight(BaseInsight):
    tag: Literal["Concert"] = Field("Concert", alias="_tag")
    artist: ArtistRef
    venue: Optional[str] = None
    date: Optional[str] = None
    city: Optional[str] = None
    source_quote: str = Field(..., alias="sourceQuote")

# Discriminated union
Insight = Annotated[
    Union[ConcertInsight, CoverInsight, SampleInsight,
          PlayHistoryInsight, ConnectionInsight, LinkInsight],
    Field(discriminator="tag")
]

# API request/response models
class CreateInsightsRequest(BaseModel):
    insights: List[Insight]

class InsightResponse(BaseModel):
    id: int
    insight_type: str
    play_id: int
    created_at: datetime
```

**Effort:** ~2 hours

---

### Phase 4: Python API Endpoints

**Goal:** Typed `/api/insights` endpoints

**File:** `faiss-search-api/app/routes/insights.py` (new file) or add to `main.py`

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/insights` | Bulk create typed insights |
| `GET` | `/api/insights` | Query with filters (play_id, type, mbid, confidence) |
| `GET` | `/api/insights/plays/{play_id}` | Get insights for a play (grouped by type) |
| `DELETE` | `/api/insights/{id}` | Soft/hard delete insight |

**Key Features:**
- Discriminated union validation on POST
- MBID extraction and indexing on insert
- Efficient queries via indexed columns
- Soft delete support

**Effort:** ~3 hours

---

### Phase 5: TypeScript API Client

**Goal:** Update agent to use typed `/api/insights` endpoint

**Files:**
- `packages/agent/src/services/InsightPersistenceService.ts` (new)
- Update `FaissClient.ts` or create dedicated client

**Implementation:**

```typescript
// InsightPersistenceService.ts
export class InsightPersistenceService extends Effect.Service<InsightPersistenceService>()(
  "InsightPersistenceService",
  {
    effect: Effect.gen(function* () {
      const config = yield* FaissConfig
      const client = yield* makeJsonClient(config.baseUrl)

      const postInsights = (insights: Insight[]) =>
        client.post("/api/insights", {
          body: HttpBody.unsafeJson({ insights })
        }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(InsightsResponseSchema)),
          Effect.mapError((error) => new InsightPersistenceError({ cause: error }))
        )

      const getPlayInsights = (playId: number) =>
        client.get(`/api/insights/plays/${playId}`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(PlayInsightsResponseSchema))
        )

      return { postInsights, getPlayInsights }
    })
  }
) {}
```

**Effort:** ~2 hours

---

### Phase 6: Deprecate EnrichmentItem

**Goal:** Clean transition from generic to typed storage

**Strategy:**
1. Mark `/api/enrichments` as deprecated (add header)
2. Keep functional for backward compatibility
3. Document migration path for existing data
4. Eventually remove after transition period

**Migration Script (Optional):**
```python
# migrate_enrichments_to_insights.py
# Transforms existing enrichment JSON blobs to typed insights
# Extracts MBIDs for indexing
# Validates against Insight schema
```

**Effort:** ~1 hour (deprecation), ~2 hours (migration script if needed)

---

## File Inventory

### Files to Create

| File | Purpose |
|------|---------|
| `faiss-search-api/migrations/003_add_insights.sql` | Database schema |
| `faiss-search-api/app/models/insights.py` | Pydantic models |
| `faiss-search-api/app/routes/insights.py` | FastAPI endpoints |
| `packages/agent/src/services/InsightPersistenceService.ts` | TS client |

### Files to Modify

| File | Change |
|------|--------|
| `packages/agent/src/prompts/system-prompt.ts` | Fix InsightSummary import |
| `packages/agent/src/tools/schemas.ts` | Add API transport types |
| `faiss-search-api/app/main.py` | Register insights router |
| `faiss-search-api/app/services/db_service.py` | Add insight CRUD methods |

### Files to Deprecate (Eventually)

| File | Reason |
|------|--------|
| `packages/domain/src/faiss/enrichment.ts` | Replace with typed Insight |
| Generic `/api/enrichments` endpoint | Replace with `/api/insights` |

---

## Implementation Order

```
Phase 1 (Immediate)     Phase 2-3 (Database)      Phase 4-5 (API)         Phase 6 (Cleanup)
─────────────────────   ─────────────────────     ─────────────────────   ─────────────────
Fix InsightSummary  ->  Create insights table ->  Add API endpoints   ->  Deprecate old
(30 min)                Add Pydantic models       Add TS client           Migrate data
                        (3 hours)                 (5 hours)               (3 hours)
```

**Total Estimated Effort:** ~12 hours

---

## Success Criteria

1. **Type Safety:** Agent insights validated at API boundary
2. **Query Efficiency:** MBID-based queries use indexes (no JSON parsing)
3. **Schema Alignment:** Single `InsightSummary` definition across codebase
4. **Prompt Context:** `formatRecentInsights()` has access to all insight fields
5. **API Consistency:** Clear separation between typed insights and legacy enrichments

---

## Open Questions

1. **Soft Delete:** Should soft-deleted insights be recoverable? (Current: Yes, via deleted_at)
2. **Unique Constraint:** One insight per type per play, or allow multiple? (Recommend: Allow multiple)
3. **Rate Limiting:** Add rate limiting to POST /api/insights? (Recommend: Yes, if public)
4. **Versioning:** Schema version in insight_types table - how to handle migrations?

---

## Related Documents

- `docs/plans/2025-12-02-crate-research-agent-design.md` - Agent architecture
- `docs/plans/2025-12-01-unified-timeline-filter-design.md` - Timeline integration
- `packages/agent/src/prompts/insights.ts` - Canonical Insight type definitions
