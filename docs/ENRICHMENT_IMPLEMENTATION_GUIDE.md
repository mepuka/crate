# KXP Enrichment Implementation Guide

> **Quick Start**: This guide provides step-by-step instructions and concrete code examples to implement the enrichment architecture. Start here to begin Phase 1.

## Table of Contents

1. [Phase 1 Setup](#phase-1-setup)
2. [Database Schema](#database-schema)
3. [Core Abstractions](#core-abstractions)
4. [First Enrichment Strategy](#first-enrichment-strategy)
5. [API Integration](#api-integration)
6. [Frontend Integration](#frontend-integration)
7. [Testing](#testing)
8. [Deployment](#deployment)

---

## Phase 1 Setup

### 1.1 Create Package Structure

```bash
# Create enrichment domain package
mkdir -p packages/domain/src/enrichment/{strategies,combinators,schemas}

# Create enrichment API endpoints
mkdir -p packages/api/src/enrichment

# Create agent enrichment workers
mkdir -p packages/agent/src/{streams,services}

# Create frontend enrichment components
mkdir -p packages/web/src/{atoms/enrichment,components/enrichment}
```

### 1.2 Install Dependencies (if needed)

```bash
# Already have Effect-TS, but ensure latest
bun add effect@latest @effect/schema@latest @effect/sql@latest
```

---

## Database Schema

### 2.1 Create Migration

**File**: `packages/server/src/knowledge_base/migrations/30_enrichment_schema.sql`

```sql
-- Enrichment metadata table
CREATE TABLE IF NOT EXISTS enrichment_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrichment_type TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(enrichment_type, version)
);

-- Artist statistics enrichments
CREATE TABLE IF NOT EXISTS artist_stats_enrichments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist TEXT NOT NULL,

  -- Play counts
  total_plays INTEGER NOT NULL,
  unique_songs INTEGER NOT NULL,
  unique_albums INTEGER NOT NULL,

  -- Temporal
  first_play_date DATETIME NOT NULL,
  last_play_date DATETIME NOT NULL,

  -- Peak period (nullable)
  peak_period_start DATETIME,
  peak_period_end DATETIME,
  peak_period_plays INTEGER,

  -- Context
  is_local_artist BOOLEAN DEFAULT 0,
  avg_plays_per_month REAL NOT NULL,

  -- Metadata
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(artist)
);

CREATE INDEX idx_artist_stats_artist ON artist_stats_enrichments(artist);
CREATE INDEX idx_artist_stats_computed_at ON artist_stats_enrichments(computed_at);

-- Song popularity enrichments
CREATE TABLE IF NOT EXISTS song_popularity_enrichments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist TEXT NOT NULL,
  song TEXT NOT NULL,

  -- Counts
  total_plays INTEGER NOT NULL,
  first_play_date DATETIME NOT NULL,
  last_play_date DATETIME NOT NULL,

  -- Peak week (nullable)
  peak_week_start DATETIME,
  peak_week_plays INTEGER,

  -- Comparative
  percentile REAL NOT NULL,

  -- Metadata
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(artist, song)
);

CREATE INDEX idx_song_popularity_artist_song ON song_popularity_enrichments(artist, song);
CREATE INDEX idx_song_popularity_computed_at ON song_popularity_enrichments(computed_at);

-- Play-level enrichments (many-to-one with plays)
CREATE TABLE IF NOT EXISTS play_enrichments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  play_id INTEGER NOT NULL,
  enrichment_type TEXT NOT NULL,

  -- JSON blob for flexible schema
  data TEXT NOT NULL, -- JSON

  -- Metadata
  enriched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  version TEXT NOT NULL,

  UNIQUE(play_id, enrichment_type),
  FOREIGN KEY (play_id) REFERENCES plays(id) ON DELETE CASCADE
);

CREATE INDEX idx_play_enrichments_play_id ON play_enrichments(play_id);
CREATE INDEX idx_play_enrichments_type ON play_enrichments(enrichment_type);

-- Co-occurrence network
CREATE TABLE IF NOT EXISTS co_occurrence_enrichments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_a TEXT NOT NULL,
  artist_b TEXT NOT NULL,

  -- Metrics
  co_occurrence_count INTEGER NOT NULL,
  jaccard_similarity REAL NOT NULL,

  -- Context
  typical_time_gap INTEGER, -- minutes
  strength TEXT NOT NULL CHECK(strength IN ('weak', 'moderate', 'strong')),

  -- Metadata
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(artist_a, artist_b)
);

CREATE INDEX idx_co_occurrence_artist_a ON co_occurrence_enrichments(artist_a);
CREATE INDEX idx_co_occurrence_artist_b ON co_occurrence_enrichments(artist_b);
CREATE INDEX idx_co_occurrence_strength ON co_occurrence_enrichments(strength);
```

### 2.2 Run Migration

```bash
# Assuming you have a migration runner
cd packages/server
bun run migrate
```

---

## Core Abstractions

### 3.1 Enrichment Strategy Interface

**File**: `packages/domain/src/enrichment/strategy.ts`

```typescript
import * as Effect from "effect/Effect"
import * as Context from "effect/Context"
import * as Schema from "@effect/schema/Schema"
import { SqlError } from "@effect/sql"

/**
 * Tagged error for enrichment failures
 */
export class EnrichmentError extends Schema.TaggedError<EnrichmentError>()(
  "EnrichmentError",
  {
    strategy: Schema.String,
    play_id: Schema.Number,
    reason: Schema.String,
    retryable: Schema.Boolean
  }
) {}

/**
 * Base interface for all enrichment strategies
 */
export interface EnrichmentStrategy<E, R = never> {
  readonly name: string
  readonly version: string

  /**
   * Enrich a single play
   */
  readonly enrichPlay: (
    play: PlayResult
  ) => Effect.Effect<E, EnrichmentError, R>

  /**
   * Enrich multiple plays (batch optimization)
   */
  readonly enrichPlays: (
    plays: ReadonlyArray<PlayResult>
  ) => Effect.Effect<ReadonlyArray<E>, EnrichmentError, R>

  /**
   * Check if enrichment needs updating
   */
  readonly needsUpdate: (
    play: PlayResult,
    existing: E | null
  ) => boolean
}
```

### 3.2 Enrichment Store Service

**File**: `packages/domain/src/enrichment/store.ts`

```typescript
import * as Effect from "effect/Effect"
import * as Context from "effect/Context"
import * as Schema from "@effect/schema/Schema"
import * as HashMap from "effect/HashMap"
import { SqlClient, SqlError } from "@effect/sql"

/**
 * Service for storing and retrieving enrichments
 */
export class EnrichmentStore extends Context.Tag("EnrichmentStore")<
  EnrichmentStore,
  {
    /**
     * Store enrichment for a play
     */
    readonly store: <E>(
      enrichmentType: string,
      playId: number,
      data: E,
      version: string
    ) => Effect.Effect<void, SqlError, never>

    /**
     * Retrieve enrichment for a play
     */
    readonly retrieve: <E>(
      enrichmentType: string,
      playId: number
    ) => Effect.Effect<{ data: E; version: string } | null, SqlError, never>

    /**
     * Retrieve enrichments for multiple plays
     */
    readonly retrieveMany: <E>(
      enrichmentType: string,
      playIds: ReadonlyArray<number>
    ) => Effect.Effect<
      HashMap.HashMap<number, { data: E; version: string }>,
      SqlError,
      never
    >
  }
>() {}

/**
 * Implementation of EnrichmentStore using SQLite
 */
export const EnrichmentStoreLive = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  return EnrichmentStore.of({
    store: <E>(
      enrichmentType: string,
      playId: number,
      data: E,
      version: string
    ) =>
      sql`
        INSERT INTO play_enrichments (play_id, enrichment_type, data, version)
        VALUES (${playId}, ${enrichmentType}, ${JSON.stringify(data)}, ${version})
        ON CONFLICT (play_id, enrichment_type)
        DO UPDATE SET
          data = ${JSON.stringify(data)},
          version = ${version},
          enriched_at = CURRENT_TIMESTAMP
      `.pipe(Effect.asVoid),

    retrieve: <E>(enrichmentType: string, playId: number) =>
      sql<{ data: string; version: string }>`
        SELECT data, version
        FROM play_enrichments
        WHERE play_id = ${playId} AND enrichment_type = ${enrichmentType}
      `.pipe(
        Effect.map(rows =>
          rows.length > 0
            ? { data: JSON.parse(rows[0].data) as E, version: rows[0].version }
            : null
        )
      ),

    retrieveMany: <E>(
      enrichmentType: string,
      playIds: ReadonlyArray<number>
    ) =>
      sql<{ play_id: number; data: string; version: string }>`
        SELECT play_id, data, version
        FROM play_enrichments
        WHERE enrichment_type = ${enrichmentType}
          AND play_id IN (${sql.join(playIds, sql`, `)})
      `.pipe(
        Effect.map(rows =>
          HashMap.fromIterable(
            rows.map(row => [
              row.play_id,
              { data: JSON.parse(row.data) as E, version: row.version }
            ])
          )
        )
      )
  })
}).pipe(Layer.effect(EnrichmentStore))
```

---

## First Enrichment Strategy

### 4.1 Artist Stats Schema

**File**: `packages/domain/src/enrichment/schemas.ts`

```typescript
import * as Schema from "@effect/schema/Schema"

/**
 * Artist statistics enrichment
 */
export class ArtistStatsEnrichment extends Schema.Class<ArtistStatsEnrichment>(
  "ArtistStatsEnrichment"
)({
  artist: Schema.String,

  // Play counts
  total_plays: Schema.Number,
  unique_songs: Schema.Number,
  unique_albums: Schema.Number,

  // Temporal
  first_play_date: Schema.DateFromString,
  last_play_date: Schema.DateFromString,

  // Peak period (optional)
  peak_period: Schema.NullOr(
    Schema.Struct({
      start: Schema.DateFromString,
      end: Schema.DateFromString,
      plays: Schema.Number
    })
  ),

  // Context
  is_local_artist: Schema.Boolean,
  avg_plays_per_month: Schema.Number,

  // Metadata
  computed_at: Schema.DateFromString
}) {}
```

### 4.2 Artist Stats Service

**File**: `packages/domain/src/enrichment/services/artist-stats.ts`

```typescript
import * as Effect from "effect/Effect"
import * as Context from "effect/Context"
import { SqlClient, SqlError } from "@effect/sql"
import { ArtistStatsEnrichment } from "../schemas.js"

/**
 * Service for computing artist statistics
 */
export class ArtistStatsService extends Context.Tag("ArtistStatsService")<
  ArtistStatsService,
  {
    readonly computeStats: (
      artist: string
    ) => Effect.Effect<ArtistStatsEnrichment, SqlError, never>
  }
>() {}

/**
 * Implementation of ArtistStatsService
 */
export const ArtistStatsServiceLive = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  return ArtistStatsService.of({
    computeStats: (artist: string) =>
      Effect.gen(function* () {
        // Get basic stats
        const basicStats = yield* sql<{
          total_plays: number
          unique_songs: number
          unique_albums: number
          first_play_date: string
          last_play_date: string
          is_local: number
        }>`
          SELECT
            COUNT(*) as total_plays,
            COUNT(DISTINCT song) as unique_songs,
            COUNT(DISTINCT album) as unique_albums,
            MIN(airdate) as first_play_date,
            MAX(airdate) as last_play_date,
            MAX(CASE WHEN is_local = 1 THEN 1 ELSE 0 END) as is_local
          FROM plays
          WHERE artist = ${artist}
        `.pipe(Effect.map(rows => rows[0]))

        // Calculate average plays per month
        const firstDate = new Date(basicStats.first_play_date)
        const lastDate = new Date(basicStats.last_play_date)
        const monthsDiff =
          (lastDate.getTime() - firstDate.getTime()) / (30 * 24 * 60 * 60 * 1000)
        const avgPlaysPerMonth = basicStats.total_plays / Math.max(monthsDiff, 1)

        // Find peak period (rolling 3-month window)
        const peakPeriod = yield* sql<{
          window_start: string
          window_end: string
          plays: number
        }>`
          WITH monthly_plays AS (
            SELECT
              DATE(airdate, 'start of month') as month,
              COUNT(*) as plays
            FROM plays
            WHERE artist = ${artist}
            GROUP BY month
          ),
          rolling_quarters AS (
            SELECT
              month as window_start,
              DATE(month, '+3 months') as window_end,
              SUM(plays) OVER (
                ORDER BY month
                ROWS BETWEEN CURRENT ROW AND 2 FOLLOWING
              ) as plays
            FROM monthly_plays
          )
          SELECT window_start, window_end, plays
          FROM rolling_quarters
          ORDER BY plays DESC
          LIMIT 1
        `.pipe(
          Effect.map(rows =>
            rows.length > 0
              ? {
                  start: new Date(rows[0].window_start),
                  end: new Date(rows[0].window_end),
                  plays: rows[0].plays
                }
              : null
          )
        )

        return new ArtistStatsEnrichment({
          artist,
          total_plays: basicStats.total_plays,
          unique_songs: basicStats.unique_songs,
          unique_albums: basicStats.unique_albums,
          first_play_date: new Date(basicStats.first_play_date),
          last_play_date: new Date(basicStats.last_play_date),
          peak_period: peakPeriod,
          is_local_artist: basicStats.is_local === 1,
          avg_plays_per_month: avgPlaysPerMonth,
          computed_at: new Date()
        })
      })
  })
}).pipe(Layer.effect(ArtistStatsService))
```

### 4.3 Artist Stats Strategy

**File**: `packages/domain/src/enrichment/strategies/artist-stats.ts`

```typescript
import * as Effect from "effect/Effect"
import * as Duration from "effect/Duration"
import * as HashMap from "effect/HashMap"
import * as Option from "effect/Option"
import { EnrichmentStrategy, EnrichmentError } from "../strategy.js"
import { ArtistStatsService } from "../services/artist-stats.js"
import { ArtistStatsEnrichment } from "../schemas.js"
import { PlayResult } from "../../faiss/schemas.js"

/**
 * Strategy for computing artist statistics
 */
export const makeArtistStatsStrategy = (): EnrichmentStrategy<
  ArtistStatsEnrichment,
  ArtistStatsService
> => ({
  name: "artist-stats",
  version: "1.0.0",

  enrichPlay: (play: PlayResult) =>
    Effect.gen(function* () {
      const service = yield* ArtistStatsService
      return yield* service.computeStats(play.artist)
    }).pipe(
      Effect.catchAll(error =>
        Effect.fail(
          new EnrichmentError({
            strategy: "artist-stats",
            play_id: play.id,
            reason: `Failed to compute artist stats: ${error}`,
            retryable: true
          })
        )
      )
    ),

  enrichPlays: (plays: ReadonlyArray<PlayResult>) =>
    Effect.gen(function* () {
      const service = yield* ArtistStatsService

      // Deduplicate artists
      const uniqueArtists = Array.from(new Set(plays.map(p => p.artist)))

      // Compute stats for each artist in parallel
      const statsArray = yield* Effect.all(
        uniqueArtists.map(artist => service.computeStats(artist)),
        { concurrency: 10 }
      )

      // Create artist -> stats map
      const statsMap = HashMap.fromIterable(
        uniqueArtists.map((artist, i) => [artist, statsArray[i]])
      )

      // Map back to plays
      return plays.map(play =>
        HashMap.get(statsMap, play.artist).pipe(
          Option.getOrThrow // Safe because we computed all artists
        )
      )
    }).pipe(
      Effect.catchAll(error =>
        Effect.fail(
          new EnrichmentError({
            strategy: "artist-stats",
            play_id: plays[0]?.id ?? 0,
            reason: `Failed to batch compute artist stats: ${error}`,
            retryable: true
          })
        )
      )
    ),

  needsUpdate: (play: PlayResult, existing: ArtistStatsEnrichment | null) => {
    if (existing === null) return true

    // Update if stats are older than 24 hours
    const age = Date.now() - existing.computed_at.getTime()
    return age > Duration.toMillis(Duration.hours(24))
  }
})
```

---

## API Integration

### 5.1 Enrichment API Schema

**File**: `packages/api/src/enrichment/api.ts`

```typescript
import * as Api from "@effect/platform/HttpApi"
import * as Schema from "@effect/schema/Schema"
import { ArtistStatsEnrichment } from "@kxp/domain/enrichment/schemas"

export class EnrichmentApi extends Api.api() {
  /**
   * Get artist statistics
   */
  static readonly getArtistStats = Api.get(
    "artistStats",
    "/enrichment/artist-stats"
  )({
    request: {
      query: Schema.Struct({
        artist: Schema.String
      })
    },
    response: {
      status: 200,
      content: Schema.Struct({
        success: Schema.Boolean,
        data: ArtistStatsEnrichment
      })
    }
  })
}
```

### 5.2 API Endpoint Implementation

**File**: `packages/server/src/api/enrichment/handlers.ts`

```typescript
import * as Effect from "effect/Effect"
import * as HttpRouter from "@effect/platform/HttpRouter"
import * as HttpServerResponse from "@effect/platform/HttpServerResponse"
import { ArtistStatsService } from "@kxp/domain/enrichment/services/artist-stats"

export const getArtistStatsHandler = HttpRouter.get(
  "/enrichment/artist-stats",
  Effect.gen(function* () {
    const request = yield* HttpRouter.request
    const artist = request.searchParams.get("artist")

    if (!artist) {
      return yield* HttpServerResponse.json(
        { success: false, error: "Missing artist parameter" },
        { status: 400 }
      )
    }

    const service = yield* ArtistStatsService
    const stats = yield* service.computeStats(artist)

    return yield* HttpServerResponse.json({
      success: true,
      data: stats
    })
  })
)
```

---

## Frontend Integration

### 6.1 Enrichment Client

**File**: `packages/web/src/lib/enrichment-client.ts`

```typescript
import { AtomHttpApi } from "@effect-atom/atom-http"
import { FetchHttpClient } from "@effect/platform"
import { EnrichmentApi } from "@kxp/api/enrichment/api"

const API_BASE_URL = "http://localhost:3000"

export class EnrichmentClient extends AtomHttpApi.Tag<EnrichmentClient>()(
  "EnrichmentClient",
  {
    api: EnrichmentApi,
    httpClient: FetchHttpClient.layer,
    baseUrl: API_BASE_URL
  }
) {}
```

### 6.2 Enrichment Atoms

**File**: `packages/web/src/atoms/enrichment/artist-stats.ts`

```typescript
import * as Effect from "effect/Effect"
import * as Atom from "@effect-atom/atom"
import { TimelineRuntime } from "../timeline.js"
import { EnrichmentClient } from "../../lib/enrichment-client.js"

/**
 * Atom for artist statistics
 */
export const artistStatsAtom = (artist: string) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const client = yield* EnrichmentClient

      const result = yield* client.enrichment.getArtistStats({
        query: { artist }
      })

      return result.data
    })
  ).pipe(Atom.withReactivity([`enrichment:artist:${artist}`]))
```

### 6.3 UI Component

**File**: `packages/web/src/components/enrichment/ArtistStatsPanel.tsx`

```typescript
import React from "react"
import { useAtomValue } from "@effect-atom/atom-react"
import { artistStatsAtom } from "../../atoms/enrichment/artist-stats.js"

interface ArtistStatsPanelProps {
  artist: string
}

export const ArtistStatsPanel: React.FC<ArtistStatsPanelProps> = ({
  artist
}) => {
  const stats = useAtomValue(artistStatsAtom(artist))

  if (!stats) {
    return <div>Loading artist stats...</div>
  }

  return (
    <details className="artist-stats-panel">
      <summary>
        {stats.total_plays} plays • {stats.unique_songs} songs
      </summary>

      <div className="stats-details">
        <p>
          <strong>First played:</strong>{" "}
          {stats.first_play_date.toLocaleDateString()}
        </p>
        <p>
          <strong>Last played:</strong>{" "}
          {stats.last_play_date.toLocaleDateString()}
        </p>

        {stats.peak_period && (
          <p>
            <strong>Peak rotation:</strong>{" "}
            {stats.peak_period.start.toLocaleDateString()} -{" "}
            {stats.peak_period.end.toLocaleDateString()} (
            {stats.peak_period.plays} plays)
          </p>
        )}

        {stats.is_local_artist && (
          <span className="badge badge-local">Seattle/PNW Artist</span>
        )}

        <p>
          <strong>Average:</strong> {stats.avg_plays_per_month.toFixed(1)}{" "}
          plays/month
        </p>
      </div>
    </details>
  )
}
```

---

## Testing

### 7.1 Unit Test for Strategy

**File**: `packages/domain/src/enrichment/strategies/__tests__/artist-stats.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { makeArtistStatsStrategy } from "../artist-stats.js"
import { ArtistStatsService } from "../../services/artist-stats.js"
import { PlayResult } from "../../../faiss/schemas.js"

// Mock service
const MockArtistStatsService = Layer.succeed(
  ArtistStatsService,
  ArtistStatsService.of({
    computeStats: (artist: string) =>
      Effect.succeed({
        artist,
        total_plays: 100,
        unique_songs: 20,
        unique_albums: 5,
        first_play_date: new Date("2008-01-01"),
        last_play_date: new Date("2024-01-01"),
        peak_period: {
          start: new Date("2008-06-01"),
          end: new Date("2008-09-01"),
          plays: 45
        },
        is_local_artist: true,
        avg_plays_per_month: 5.2,
        computed_at: new Date()
      })
  })
)

describe("ArtistStatsStrategy", () => {
  it("should enrich a single play", async () => {
    const strategy = makeArtistStatsStrategy()

    const play = new PlayResult({
      id: 1,
      artist: "Fleet Foxes",
      song: "White Winter Hymnal",
      album: "Fleet Foxes",
      similarity: 0.95,
      airdate: new Date("2008-03-15"),
      release_date: null,
      labels: ["Sub Pop"],
      rotation_status: "Heavy",
      is_local: true,
      is_live: false,
      is_request: false,
      artist_mbid: [],
      recording_mbid: null,
      release_mbid: null,
      release_group_mbid: null
    })

    const result = await Effect.runPromise(
      strategy.enrichPlay(play).pipe(Effect.provide(MockArtistStatsService))
    )

    expect(result.artist).toBe("Fleet Foxes")
    expect(result.total_plays).toBe(100)
    expect(result.is_local_artist).toBe(true)
  })
})
```

---

## Deployment

### 8.1 Run Batch Enrichment

**File**: `packages/agent/src/cli/enrich-batch.ts`

```typescript
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import { SqlClient } from "@effect/sql"
import { BunContext } from "@effect/platform-bun"
import { makeArtistStatsStrategy } from "@kxp/domain/enrichment/strategies/artist-stats"
import { ArtistStatsServiceLive } from "@kxp/domain/enrichment/services/artist-stats"
import { EnrichmentStoreLive } from "@kxp/domain/enrichment/store"

const batchEnrich = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const strategy = makeArtistStatsStrategy()

  let offset = 0
  const batchSize = 100
  let totalEnriched = 0

  while (true) {
    // Fetch batch
    const plays = yield* sql<PlayResult>`
      SELECT * FROM plays
      ORDER BY id
      LIMIT ${batchSize} OFFSET ${offset}
    `

    if (plays.length === 0) break

    // Enrich batch
    yield* strategy.enrichPlays(plays)

    totalEnriched += plays.length
    offset += batchSize

    console.log(`Enriched ${totalEnriched} plays...`)
  }

  console.log(`✓ Batch enrichment complete: ${totalEnriched} plays`)
}).pipe(
  Effect.provide(ArtistStatsServiceLive),
  Effect.provide(EnrichmentStoreLive),
  Effect.provide(BunContext.layer)
)

Effect.runPromise(batchEnrich)
```

**Run it:**

```bash
cd packages/agent
bun run src/cli/enrich-batch.ts
```

---

## Next Steps

After completing Phase 1:

1. ✅ **Verify enrichments**: Query `artist_stats_enrichments` table
2. ✅ **Test API endpoint**: `GET /enrichment/artist-stats?artist=Fleet+Foxes`
3. ✅ **Test UI component**: Add `<ArtistStatsPanel>` to a play card
4. 🔄 **Move to Phase 2**: Implement song popularity and new play enrichments

---

**This implementation guide provides all the code and steps needed to get started with the KXP enrichment architecture. Follow these examples and adapt them for additional enrichment strategies.**
