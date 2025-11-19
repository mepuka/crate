# KXP Historical Crate: Enrichment & Search Architecture

> **Design Philosophy**: Stay close to the data. Stay close to the crate. Subtle enhancements that draw users deeper into musical discovery.

## Executive Summary

This document outlines a comprehensive enrichment and search architecture for the KXP Historical Crate that leverages Effect-TS patterns to create a composable, reactive system for analyzing play data and surfacing insights that enhance user exploration.

**Core Principles**:
- **Composable Enrichments**: Higher-order abstractions for chaining enrichment strategies
- **Reactive by Default**: Enrichments trigger automatic UI updates via Effect Atom reactivity
- **Stream-Based Processing**: Handle 2.2M+ plays efficiently with Effect Stream
- **Type-Safe Pipeline**: Schema validation and branded types throughout
- **Subtle UX**: Information appears naturally as users explore, never interrupts flow

---

## 1. Enrichment Philosophy

### The "Discovery Breadcrumbs" Metaphor

Enrichments are **discovery breadcrumbs** scattered throughout the infinite timeline. As users dig through the crate, they encounter:

- **Temporal Patterns**: "Heavy rotation in December 2008"
- **Artist Narratives**: "First KEXP play • 127 total plays • Last heard 6 months ago"
- **Musical Connections**: "Often played alongside Modest Mouse"
- **Community Signals**: "New music Monday pick"
- **Historical Context**: "Part of the Seattle indie boom"

These breadcrumbs are:
1. **Non-intrusive**: Rendered inline, never modal/popover
2. **Contextual**: Only show when relevant to current view
3. **Actionable**: Click to explore similar patterns
4. **Cumulative**: Build narrative as user scrolls

---

## 2. Enrichment Type Taxonomy

### 2.1 Static Enrichments (Computed Once)

**MusicBrainz Resolution**
```typescript
class MusicBrainzEnrichment extends Schema.Class<MusicBrainzEnrichment>("MusicBrainzEnrichment")({
  play_id: Schema.Number,

  // Resolved IDs
  canonical_artist_mbid: Schema.NullOr(Schema.String),
  canonical_release_mbid: Schema.NullOr(Schema.String),
  canonical_recording_mbid: Schema.NullOr(Schema.String),

  // Metadata
  artist_country: Schema.NullOr(Schema.String),
  artist_type: Schema.NullOr(Schema.Literal("person", "group", "other")),
  release_date: Schema.NullOr(Schema.DateFromString),
  genres: Schema.Array(Schema.String),
  tags: Schema.Array(Schema.String), // weighted tags

  // Enrichment metadata
  enriched_at: Schema.DateFromString,
  confidence: Schema.Number.pipe(Schema.between(0, 1))
})
```

**Semantic Embeddings**
```typescript
class EmbeddingEnrichment extends Schema.Class<EmbeddingEnrichment>("EmbeddingEnrichment")({
  play_id: Schema.Number,
  embedding_vector: Schema.Array(Schema.Number), // 256d
  model_version: Schema.String, // "mpnet-v1-pca256"
  generated_at: Schema.DateFromString
})
```

### 2.2 Aggregate Enrichments (Computed Periodically)

**Artist Statistics**
```typescript
class ArtistStatsEnrichment extends Schema.Class<ArtistStatsEnrichment>("ArtistStatsEnrichment")({
  artist: Schema.String,

  // Play counts
  total_plays: Schema.Number,
  unique_songs: Schema.Number,
  unique_albums: Schema.Number,

  // Temporal
  first_play_date: Schema.DateFromString,
  last_play_date: Schema.DateFromString,
  peak_period: Schema.Struct({
    start: Schema.DateFromString,
    end: Schema.DateFromString,
    plays: Schema.Number
  }).pipe(Schema.NullOr),

  // Rotation patterns
  rotation_history: Schema.Array(Schema.Struct({
    status: Schema.String, // "Heavy", "Medium", "Light"
    period: Schema.String, // "2008-Q1"
    plays: Schema.Number
  })),

  // Context
  is_local_artist: Schema.Boolean,
  avg_plays_per_month: Schema.Number,

  computed_at: Schema.DateFromString
})
```

**Song Popularity**
```typescript
class SongPopularityEnrichment extends Schema.Class<SongPopularityEnrichment>("SongPopularityEnrichment")({
  artist: Schema.String,
  song: Schema.String,

  total_plays: Schema.Number,
  first_play_date: Schema.DateFromString,
  last_play_date: Schema.DateFromString,

  // Temporal distribution
  plays_by_year: Schema.Record({ key: Schema.String, value: Schema.Number }),
  plays_by_month: Schema.Record({ key: Schema.String, value: Schema.Number }),

  // Peaks
  peak_week: Schema.Struct({
    week_start: Schema.DateFromString,
    plays: Schema.Number
  }).pipe(Schema.NullOr),

  // Comparative
  percentile: Schema.Number.pipe(Schema.between(0, 100)), // How popular vs all songs

  computed_at: Schema.DateFromString
})
```

### 2.3 Relational Enrichments (Graph-Based)

**Co-Occurrence Network**
```typescript
class CoOccurrenceEnrichment extends Schema.Class<CoOccurrenceEnrichment>("CoOccurrenceEnrichment")({
  artist_a: Schema.String,
  artist_b: Schema.String,

  // Metrics
  co_occurrence_count: Schema.Number,
  jaccard_similarity: Schema.Number.pipe(Schema.between(0, 1)),

  // Context
  typical_time_gap: Schema.Number, // minutes between plays
  common_shows: Schema.Array(Schema.String), // Show names
  common_hosts: Schema.Array(Schema.String),

  // Strength
  strength: Schema.Literal("weak", "moderate", "strong"),

  computed_at: Schema.DateFromString
})
```

**Semantic Similarity Clusters**
```typescript
class SimilarityClusterEnrichment extends Schema.Class<SimilarityClusterEnrichment>("SimilarityClusterEnrichment")({
  play_id: Schema.Number,

  cluster_id: Schema.Number,
  cluster_label: Schema.NullOr(Schema.String), // e.g., "Seattle Indie Rock 2008"

  // Similar plays
  nearest_neighbors: Schema.Array(Schema.Struct({
    play_id: Schema.Number,
    similarity: Schema.Number,
    artist: Schema.String,
    song: Schema.String
  })),

  // Cluster stats
  cluster_size: Schema.Number,
  cluster_cohesion: Schema.Number.pipe(Schema.between(0, 1)),

  computed_at: Schema.DateFromString
})
```

### 2.4 Real-Time Enrichments (Live Updates)

**New Play Analysis**
```typescript
class NewPlayEnrichment extends Schema.Class<NewPlayEnrichment>("NewPlayEnrichment")({
  play_id: Schema.Number,

  // Novelty
  is_artist_debut: Schema.Boolean,
  is_song_debut: Schema.Boolean,
  is_album_debut: Schema.Boolean,

  // Recency
  artist_last_played: Schema.NullOr(Schema.DateFromString),
  song_last_played: Schema.NullOr(Schema.DateFromString),
  days_since_last_play: Schema.NullOr(Schema.Number),

  // Predictions (if we had a model)
  predicted_rotation_status: Schema.NullOr(Schema.String),

  analyzed_at: Schema.DateFromString
})
```

---

## 3. Composable Enrichment Pipeline Architecture

### 3.1 Core Abstractions

```typescript
// packages/domain/src/enrichment/pipeline.ts

/**
 * An enrichment strategy transforms play data into insights
 */
export interface EnrichmentStrategy<E, R = never> {
  readonly name: string
  readonly version: string

  /**
   * Enrich a single play
   */
  readonly enrichPlay: (play: PlayResult) => Effect.Effect<E, EnrichmentError, R>

  /**
   * Enrich multiple plays (may be more efficient)
   */
  readonly enrichPlays: (plays: ReadonlyArray<PlayResult>) =>
    Effect.Effect<ReadonlyArray<E>, EnrichmentError, R>

  /**
   * Check if this play needs re-enrichment
   */
  readonly needsUpdate: (play: PlayResult, existing: E | null) => boolean
}

/**
 * Tagged error for enrichment failures
 */
export class EnrichmentError extends Schema.TaggedError<EnrichmentError>()("EnrichmentError", {
  strategy: Schema.String,
  play_id: Schema.Number,
  reason: Schema.String,
  retryable: Schema.Boolean
}) {}

/**
 * Service for storing enrichments
 */
export class EnrichmentStore extends Context.Tag("EnrichmentStore")<
  EnrichmentStore,
  {
    readonly store: <E>(
      enrichmentType: string,
      playId: number,
      data: E
    ) => Effect.Effect<void, SqlError>

    readonly retrieve: <E>(
      enrichmentType: string,
      playId: number,
      schema: Schema.Schema<E>
    ) => Effect.Effect<E | null, SqlError>

    readonly retrieveMany: <E>(
      enrichmentType: string,
      playIds: ReadonlyArray<number>,
      schema: Schema.Schema<E>
    ) => Effect.Effect<HashMap.HashMap<number, E>, SqlError>
  }
>() {}
```

### 3.2 Higher-Order Enrichment Combinators

```typescript
// packages/domain/src/enrichment/combinators.ts

/**
 * Run multiple enrichments in parallel
 */
export const parallel = <E1, E2, R1, R2>(
  strategy1: EnrichmentStrategy<E1, R1>,
  strategy2: EnrichmentStrategy<E2, R2>
): EnrichmentStrategy<readonly [E1, E2], R1 | R2> => ({
  name: `parallel(${strategy1.name}, ${strategy2.name})`,
  version: `${strategy1.version}+${strategy2.version}`,

  enrichPlay: (play) =>
    Effect.all([
      strategy1.enrichPlay(play),
      strategy2.enrichPlay(play)
    ], { concurrency: "unbounded" }),

  enrichPlays: (plays) =>
    Effect.all([
      strategy1.enrichPlays(plays),
      strategy2.enrichPlays(plays)
    ], { concurrency: "unbounded" }).pipe(
      Effect.map(([e1, e2]) =>
        plays.map((_, i) => [e1[i], e2[i]] as const)
      )
    ),

  needsUpdate: (play, existing) =>
    existing === null ||
    strategy1.needsUpdate(play, existing[0]) ||
    strategy2.needsUpdate(play, existing[1])
})

/**
 * Run enrichments sequentially (when one depends on another)
 */
export const sequential = <E1, E2, R1, R2>(
  strategy1: EnrichmentStrategy<E1, R1>,
  strategy2: (first: E1) => EnrichmentStrategy<E2, R2>
): EnrichmentStrategy<readonly [E1, E2], R1 | R2> => ({
  name: `sequential(${strategy1.name}, ...)`,
  version: strategy1.version,

  enrichPlay: (play) =>
    Effect.gen(function* () {
      const e1 = yield* strategy1.enrichPlay(play)
      const e2 = yield* strategy2(e1).enrichPlay(play)
      return [e1, e2] as const
    }),

  enrichPlays: (plays) =>
    Effect.gen(function* () {
      const e1Array = yield* strategy1.enrichPlays(plays)
      const e2Array = yield* Effect.all(
        plays.map((play, i) => strategy2(e1Array[i]).enrichPlay(play)),
        { concurrency: 10 }
      )
      return plays.map((_, i) => [e1Array[i], e2Array[i]] as const)
    }),

  needsUpdate: (play, existing) =>
    existing === null || strategy1.needsUpdate(play, existing[0])
})

/**
 * Cache enrichments (don't recompute unless stale)
 */
export const cached = <E, R>(
  strategy: EnrichmentStrategy<E, R>,
  ttl: Duration.Duration
): EnrichmentStrategy<E, R | EnrichmentStore> => ({
  name: `cached(${strategy.name})`,
  version: strategy.version,

  enrichPlay: (play) =>
    Effect.gen(function* () {
      const store = yield* EnrichmentStore

      // Try to retrieve from cache
      const cached = yield* store.retrieve(
        strategy.name,
        play.id,
        // We'd need the schema here
      ).pipe(Effect.orElseSucceed(() => null))

      if (cached !== null && !strategy.needsUpdate(play, cached)) {
        return cached
      }

      // Compute and store
      const enriched = yield* strategy.enrichPlay(play)
      yield* store.store(strategy.name, play.id, enriched)

      return enriched
    }),

  enrichPlays: (plays) =>
    Effect.gen(function* () {
      const store = yield* EnrichmentStore

      // Retrieve cached
      const cachedMap = yield* store.retrieveMany(
        strategy.name,
        plays.map(p => p.id),
        // schema
      ).pipe(Effect.orElseSucceed(() => HashMap.empty()))

      // Partition: cached vs needs update
      const [cached, needsUpdate] = plays.reduce(
        ([c, u], play) => {
          const existing = HashMap.get(cachedMap, play.id).pipe(
            Option.getOrNull
          )

          if (existing !== null && !strategy.needsUpdate(play, existing)) {
            return [[...c, existing], u]
          } else {
            return [c, [...u, play]]
          }
        },
        [[], []] as [Array<E>, Array<PlayResult>]
      )

      // Enrich missing
      const newlyEnriched = needsUpdate.length > 0
        ? yield* strategy.enrichPlays(needsUpdate)
        : []

      // Store new enrichments
      yield* Effect.all(
        needsUpdate.map((play, i) =>
          store.store(strategy.name, play.id, newlyEnriched[i])
        ),
        { concurrency: 50 }
      )

      // Merge results maintaining order
      return plays.map(play => {
        const cached = HashMap.get(cachedMap, play.id)
        if (Option.isSome(cached)) return cached.value

        const idx = needsUpdate.findIndex(p => p.id === play.id)
        return newlyEnriched[idx]
      })
    }),

  needsUpdate: strategy.needsUpdate
})

/**
 * Retry failed enrichments with exponential backoff
 */
export const withRetry = <E, R>(
  strategy: EnrichmentStrategy<E, R>,
  schedule: Schedule.Schedule<unknown, unknown, R>
): EnrichmentStrategy<E, R> => ({
  name: `retryable(${strategy.name})`,
  version: strategy.version,

  enrichPlay: (play) =>
    strategy.enrichPlay(play).pipe(
      Effect.retry(schedule),
      Effect.catchAll(error =>
        Effect.fail(new EnrichmentError({
          strategy: strategy.name,
          play_id: play.id,
          reason: `Max retries exceeded: ${error}`,
          retryable: false
        }))
      )
    ),

  enrichPlays: (plays) =>
    strategy.enrichPlays(plays).pipe(
      Effect.retry(schedule)
    ),

  needsUpdate: strategy.needsUpdate
})

/**
 * Add telemetry to enrichment
 */
export const withTelemetry = <E, R>(
  strategy: EnrichmentStrategy<E, R>
): EnrichmentStrategy<E, R> => ({
  name: strategy.name,
  version: strategy.version,

  enrichPlay: (play) =>
    strategy.enrichPlay(play).pipe(
      Effect.withSpan(`enrichment.${strategy.name}`, {
        attributes: {
          play_id: play.id,
          artist: play.artist,
          song: play.song
        }
      }),
      Effect.tap(enrichment =>
        Effect.logInfo(`Enriched play ${play.id} with ${strategy.name}`)
      )
    ),

  enrichPlays: (plays) =>
    strategy.enrichPlays(plays).pipe(
      Effect.withSpan(`enrichment.${strategy.name}.batch`, {
        attributes: {
          play_count: plays.length
        }
      })
    ),

  needsUpdate: strategy.needsUpdate
})
```

### 3.3 Concrete Enrichment Strategies

```typescript
// packages/domain/src/enrichment/strategies/artist-stats.ts

export class ArtistStatsService extends Context.Tag("ArtistStatsService")<
  ArtistStatsService,
  {
    readonly computeStats: (
      artist: string
    ) => Effect.Effect<ArtistStatsEnrichment, SqlError, PlayRepository>
  }
>() {}

export const makeArtistStatsStrategy = (): EnrichmentStrategy<
  ArtistStatsEnrichment,
  ArtistStatsService
> => ({
  name: "artist-stats",
  version: "1.0.0",

  enrichPlay: (play) =>
    Effect.gen(function* () {
      const service = yield* ArtistStatsService
      return yield* service.computeStats(play.artist)
    }).pipe(
      Effect.catchAll(error =>
        Effect.fail(new EnrichmentError({
          strategy: "artist-stats",
          play_id: play.id,
          reason: error.toString(),
          retryable: true
        }))
      )
    ),

  enrichPlays: (plays) =>
    Effect.gen(function* () {
      const service = yield* ArtistStatsService

      // Deduplicate artists
      const uniqueArtists = Array.from(new Set(plays.map(p => p.artist)))

      // Compute stats for each artist (parallel)
      const statsMap = yield* Effect.all(
        uniqueArtists.map(artist =>
          service.computeStats(artist).pipe(
            Effect.map(stats => [artist, stats] as const)
          )
        ),
        { concurrency: 10 }
      ).pipe(
        Effect.map(pairs => HashMap.fromIterable(pairs))
      )

      // Map back to plays
      return plays.map(play =>
        HashMap.get(statsMap, play.artist).pipe(
          Option.getOrThrow // Safe because we computed all artists
        )
      )
    }),

  needsUpdate: (play, existing) => {
    if (existing === null) return true

    // Update if stats are older than 24 hours
    const age = Date.now() - existing.computed_at.getTime()
    return age > Duration.toMillis(Duration.hours(24))
  }
})
```

### 3.4 Enrichment Pipeline Composition

```typescript
// packages/agent/src/pipelines/main-enrichment-pipeline.ts

/**
 * The main enrichment pipeline for all plays
 */
export const mainEnrichmentPipeline = pipe(
  // Start with MusicBrainz resolution
  makeMusicBrainzStrategy(),

  // Cache for 30 days (static data)
  cached(Duration.days(30)),

  // Run artist stats in parallel
  parallel(
    pipe(
      makeArtistStatsStrategy(),
      cached(Duration.hours(24))
    )
  ),

  // Run song popularity in parallel
  parallel(
    pipe(
      makeSongPopularityStrategy(),
      cached(Duration.hours(24))
    )
  ),

  // Add semantic similarity (depends on embeddings)
  sequential((mbData) =>
    pipe(
      makeSimilarityClusterStrategy(mbData),
      cached(Duration.days(7))
    )
  ),

  // Add retry logic to entire pipeline
  withRetry(
    Schedule.exponential("100 millis").pipe(
      Schedule.compose(Schedule.recurs(3))
    )
  ),

  // Add telemetry
  withTelemetry
)

/**
 * Real-time enrichment pipeline for new plays
 */
export const realtimeEnrichmentPipeline = pipe(
  makeNewPlayEnrichment(),

  // Run co-occurrence analysis in parallel
  parallel(
    makeCoOccurrenceStrategy()
  ),

  // No caching for real-time data
  withRetry(
    Schedule.exponential("50 millis").pipe(
      Schedule.compose(Schedule.recurs(2))
    )
  ),

  withTelemetry
)
```

---

## 4. Stream-Based Enrichment Processing

### 4.1 Batch Enrichment Stream

```typescript
// packages/agent/src/streams/batch-enrichment-stream.ts

/**
 * Stream that enriches all plays in the database
 */
export const makeBatchEnrichmentStream = (
  batchSize: number = 100
) =>
  Stream.paginateEffect(
    { offset: 0 },
    (state) => Effect.gen(function* () {
      const playRepo = yield* PlayRepository
      const pipeline = yield* EnrichmentPipeline

      // Fetch batch of plays
      const plays = yield* playRepo.getPlaysRange(state.offset, batchSize)

      if (Chunk.isEmpty(plays)) {
        return [[], Option.none()]
      }

      // Enrich batch
      const enriched = yield* pipeline.enrichPlays(Chunk.toReadonlyArray(plays))

      // Log progress
      yield* Effect.logInfo(
        `Enriched plays ${state.offset} to ${state.offset + plays.length}`
      )

      const nextState = Option.some({ offset: state.offset + batchSize })

      return [enriched, nextState]
    })
  ).pipe(
    Stream.flatMap(enrichments => Stream.fromIterable(enrichments)),

    // Add concurrency control
    Stream.buffer({ capacity: 10 }),

    // Handle errors gracefully
    Stream.catchAll(error =>
      Effect.gen(function* () {
        yield* Effect.logError(`Enrichment stream error: ${error}`)
        return Stream.empty
      })
    )
  )

/**
 * Run the enrichment stream with progress tracking
 */
export const runBatchEnrichment = Effect.gen(function* () {
  const stream = makeBatchEnrichmentStream(100)

  let count = 0

  yield* stream.pipe(
    Stream.tap(() =>
      Effect.sync(() => {
        count++
        if (count % 1000 === 0) {
          console.log(`Enriched ${count} plays`)
        }
      })
    ),
    Stream.runDrain
  )

  yield* Effect.logInfo(`Batch enrichment complete: ${count} plays enriched`)
})
```

### 4.2 Real-Time Enrichment Stream

```typescript
// packages/agent/src/streams/realtime-enrichment-stream.ts

/**
 * Stream that enriches new plays as they arrive
 *
 * Integrates with the live polling system
 */
export const makeRealtimeEnrichmentStream = Effect.gen(function* () {
  const timelineKVS = yield* TimelineKVS
  const pipeline = yield* RealtimeEnrichmentPipeline

  // Subscribe to new plays via Reactivity
  return Stream.asyncEffect<PlayResult, never, never>((emit) =>
    Effect.gen(function* () {
      // Poll for new plays
      const checkForNew = Effect.gen(function* () {
        const lastSeenId = yield* timelineKVS.getLastSeenId()
        const plays = yield* timelineKVS.getPlaysChunk()

        // Filter to only new plays (id > lastSeenId)
        const newPlays = Chunk.filter(plays, play => play.id > lastSeenId)

        if (Chunk.isNonEmpty(newPlays)) {
          yield* Effect.all(
            Chunk.toReadonlyArray(newPlays).map(play => emit.single(play)),
            { concurrency: "unbounded" }
          )
        }
      })

      // Poll every 30 seconds
      yield* checkForNew.pipe(
        Effect.repeat(Schedule.spaced(Duration.seconds(30))),
        Effect.forever,
        Effect.forkDaemon
      )
    })
  )
}).pipe(
  Effect.map(stream =>
    stream.pipe(
      // Enrich each new play
      Stream.mapEffect(play =>
        Effect.gen(function* () {
          const pipeline = yield* RealtimeEnrichmentPipeline
          return yield* pipeline.enrichPlay(play)
        })
      ),

      // Store enrichments and trigger reactivity
      Stream.tap(enrichment =>
        Effect.gen(function* () {
          const store = yield* EnrichmentStore
          const reactivity = yield* Reactivity

          yield* store.store("new-play", enrichment.play_id, enrichment)

          // Invalidate so UI updates
          yield* reactivity.invalidate([
            `enrichment:play:${enrichment.play_id}`,
            "enrichment:new_plays"
          ])
        })
      ),

      Stream.runDrain
    )
  )
)
```

---

## 5. Search Flow Enhancements

### 5.1 Enriched Search Results

```typescript
// packages/domain/src/search/enriched-search.ts

/**
 * Search result with inline enrichments
 */
export class EnrichedSearchResult extends Schema.Class<EnrichedSearchResult>("EnrichedSearchResult")({
  // Base play data
  play: PlayResult,

  // Search metadata
  similarity: Schema.Number,
  rank: Schema.Number,

  // Enrichments (nullable - may not be computed yet)
  artist_stats: Schema.NullOr(ArtistStatsEnrichment),
  song_popularity: Schema.NullOr(SongPopularityEnrichment),
  similar_plays: Schema.NullOr(Schema.Array(Schema.Struct({
    play_id: Schema.Number,
    artist: Schema.String,
    song: Schema.String,
    similarity: Schema.Number
  }))),

  // Computed insights
  insights: Schema.Array(Schema.Struct({
    type: Schema.Literal(
      "first_play",
      "peak_rotation",
      "rare_track",
      "local_artist",
      "recent_return",
      "similar_to_query"
    ),
    label: Schema.String, // Human-readable
    action: Schema.NullOr(Schema.Struct({
      type: Schema.Literal("search", "filter", "jump"),
      params: Schema.Record({ key: Schema.String, value: Schema.String })
    }))
  }))
})

/**
 * Service for enriched search
 */
export class EnrichedSearchService extends Context.Tag("EnrichedSearchService")<
  EnrichedSearchService,
  {
    readonly search: (
      query: string,
      options: {
        limit?: number
        offset?: number
        includeEnrichments?: boolean
        generateInsights?: boolean
      }
    ) => Effect.Effect<
      {
        results: ReadonlyArray<EnrichedSearchResult>
        total: number
        query_embedding?: ReadonlyArray<number>
      },
      SearchError,
      FaissClient | EnrichmentStore
    >
  }
>() {}
```

### 5.2 Search Insight Generation

```typescript
// packages/domain/src/search/insights.ts

/**
 * Generate insights from enriched data
 */
export const generateInsights = (
  play: PlayResult,
  enrichments: {
    artist_stats: ArtistStatsEnrichment | null
    song_popularity: SongPopularityEnrichment | null
  }
): ReadonlyArray<Insight> => {
  const insights: Array<Insight> = []

  // Artist debut
  if (enrichments.artist_stats?.first_play_date?.getTime() === play.airdate.getTime()) {
    insights.push({
      type: "first_play",
      label: `First KEXP play by ${play.artist}`,
      action: {
        type: "filter",
        params: { artist: play.artist }
      }
    })
  }

  // Peak rotation
  if (enrichments.artist_stats?.peak_period) {
    const { start, end, plays } = enrichments.artist_stats.peak_period
    if (play.airdate >= start && play.airdate <= end) {
      insights.push({
        type: "peak_rotation",
        label: `Peak rotation period (${plays} plays)`,
        action: {
          type: "filter",
          params: {
            artist: play.artist,
            date_start: start.toISOString(),
            date_end: end.toISOString()
          }
        }
      })
    }
  }

  // Rare track
  if (enrichments.song_popularity && enrichments.song_popularity.total_plays <= 3) {
    insights.push({
      type: "rare_track",
      label: `Rare track (only ${enrichments.song_popularity.total_plays} plays)`,
      action: null
    })
  }

  // Local artist
  if (enrichments.artist_stats?.is_local_artist) {
    insights.push({
      type: "local_artist",
      label: "Seattle/PNW artist",
      action: {
        type: "filter",
        params: { is_local: "true" }
      }
    })
  }

  return insights
}
```

### 5.3 Semantic Search with Context

```typescript
// packages/domain/src/search/semantic-search-context.ts

/**
 * Enhanced semantic search that uses enrichments to improve results
 */
export const makeContextualSemanticSearch = Effect.gen(function* () {
  const faiss = yield* FaissClient
  const enrichmentStore = yield* EnrichmentStore

  return (query: string, options: { limit?: number } = {}) =>
    Effect.gen(function* () {
      // Base semantic search
      const baseResults = yield* faiss.search({
        query,
        limit: (options.limit ?? 20) * 2 // Fetch 2x for reranking
      })

      // Fetch enrichments for all results
      const enrichments = yield* enrichmentStore.retrieveMany(
        "artist-stats",
        baseResults.map(r => r.play_id),
        ArtistStatsEnrichment
      )

      // Re-rank based on enrichments
      const reranked = baseResults
        .map((result, idx) => {
          const stats = HashMap.get(enrichments, result.play_id).pipe(
            Option.getOrNull
          )

          let score = result.similarity

          // Boost local artists
          if (stats?.is_local_artist) {
            score *= 1.1
          }

          // Boost if in peak rotation period
          if (stats?.peak_period) {
            const { start, end } = stats.peak_period
            if (result.airdate >= start && result.airdate <= end) {
              score *= 1.05
            }
          }

          // Boost newer tracks slightly
          const ageYears = (Date.now() - result.airdate.getTime()) /
            (365 * 24 * 60 * 60 * 1000)
          score *= Math.exp(-0.01 * ageYears) // Gentle decay

          return { ...result, score, stats }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, options.limit ?? 20)

      return reranked
    })
})
```

---

## 6. Frontend Integration

### 6.1 Enrichment Atoms

```typescript
// packages/web/src/atoms/enrichments.ts

/**
 * Atom for artist stats by artist name
 */
export const artistStatsAtom = (artist: string) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const enrichmentClient = yield* EnrichmentClient

      return yield* enrichmentClient.getArtistStats({ artist })
    })
  ).pipe(
    Atom.withReactivity([`enrichment:artist:${artist}`])
  )

/**
 * Atom for enrichments on a specific play
 */
export const playEnrichmentsAtom = (playId: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const enrichmentClient = yield* EnrichmentClient

      return yield* enrichmentClient.getPlayEnrichments({ playId })
    })
  ).pipe(
    Atom.withReactivity([`enrichment:play:${playId}`])
  )

/**
 * Atom for similar plays (semantic neighbors)
 */
export const similarPlaysAtom = (playId: number, limit: number = 10) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const enrichmentClient = yield* EnrichmentClient

      return yield* enrichmentClient.getSimilarPlays({ playId, limit })
    })
  ).pipe(
    Atom.withReactivity([`enrichment:similar:${playId}`])
  )
```

### 6.2 Enriched PlayCard Component

```typescript
// packages/web/src/components/EnrichedPlayCard.tsx

export const EnrichedPlayCard = ({ play }: { play: PlayResult }) => {
  // Fetch enrichments reactively
  const enrichments = useAtomValue(playEnrichmentsAtom(play.id))
  const artistStats = useAtomValue(artistStatsAtom(play.artist))

  return (
    <div className="play-card">
      {/* Standard play card content */}
      <PlayCard play={play} />

      {/* Enrichment badges (subtle, inline) */}
      {enrichments && (
        <div className="enrichment-badges">
          {enrichments.is_artist_debut && (
            <Badge variant="debut">First KEXP Play</Badge>
          )}

          {enrichments.days_since_last_play !== null &&
           enrichments.days_since_last_play > 365 && (
            <Badge variant="return">
              Back after {Math.floor(enrichments.days_since_last_play / 365)} years
            </Badge>
          )}
        </div>
      )}

      {/* Artist stats footer (collapsible) */}
      {artistStats && (
        <details className="artist-stats">
          <summary>
            {artistStats.total_plays} plays across {artistStats.unique_songs} songs
          </summary>

          <div className="stats-details">
            <p>
              First played: {formatDate(artistStats.first_play_date)}
            </p>
            <p>
              Last played: {formatDate(artistStats.last_play_date)}
            </p>

            {artistStats.peak_period && (
              <p>
                Peak rotation: {formatDate(artistStats.peak_period.start)} to{' '}
                {formatDate(artistStats.peak_period.end)} ({artistStats.peak_period.plays} plays)
              </p>
            )}

            {artistStats.is_local_artist && (
              <Badge variant="local">Seattle/PNW Artist</Badge>
            )}
          </div>
        </details>
      )}
    </div>
  )
}
```

### 6.3 Discovery Sidebar

```typescript
// packages/web/src/components/DiscoverySidebar.tsx

/**
 * Sidebar that shows contextual discovery prompts based on current view
 */
export const DiscoverySidebar = () => {
  const currentPlay = useCurrentPlay() // From router state
  const similar = useAtomValue(similarPlaysAtom(currentPlay?.id ?? 0))

  if (!currentPlay) {
    return <div className="sidebar">Explore the timeline...</div>
  }

  return (
    <aside className="discovery-sidebar">
      <section>
        <h3>Similar Tracks</h3>
        {similar && (
          <ul className="similar-list">
            {similar.slice(0, 5).map(sim => (
              <li key={sim.play_id}>
                <Link to={`/play/${sim.play_id}`}>
                  <span className="artist">{sim.artist}</span>
                  <span className="song">{sim.song}</span>
                  <span className="similarity">
                    {Math.round(sim.similarity * 100)}% similar
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Quick Searches</h3>
        <ul className="quick-searches">
          <li>
            <Link to={`/search?q=${encodeURIComponent(`more like ${currentPlay.song}`)}`}>
              More like this
            </Link>
          </li>
          <li>
            <Link to={`/timeline?artist=${encodeURIComponent(currentPlay.artist)}`}>
              All {currentPlay.artist} plays
            </Link>
          </li>
          {currentPlay.album && (
            <li>
              <Link to={`/timeline?album=${encodeURIComponent(currentPlay.album)}`}>
                Album: {currentPlay.album}
              </Link>
            </li>
          )}
        </ul>
      </section>
    </aside>
  )
}
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Implement `EnrichmentStrategy` interface
- [ ] Build `EnrichmentStore` with SQLite backend
- [ ] Create higher-order combinators (`parallel`, `cached`, `withRetry`)
- [ ] Implement `ArtistStatsStrategy` as proof of concept
- [ ] Add enrichment database tables with migrations

**Deliverable**: Working enrichment pipeline that computes artist stats

### Phase 2: Core Enrichments (Week 3-4)
- [ ] Implement `SongPopularityStrategy`
- [ ] Implement `NewPlayEnrichmentStrategy`
- [ ] Build batch enrichment stream with progress tracking
- [ ] Create CLI command to run batch enrichment
- [ ] Enrich first 100K plays

**Deliverable**: Basic enrichments for historical plays

### Phase 3: Real-Time Processing (Week 5-6)
- [ ] Implement real-time enrichment stream
- [ ] Integrate with live polling system
- [ ] Add `CoOccurrenceStrategy` for artist relationships
- [ ] Build enrichment reactivity invalidation
- [ ] Wire up frontend atoms

**Deliverable**: Live enrichments as new plays arrive

### Phase 4: Semantic Enhancements (Week 7-8)
- [ ] Implement `SimilarityClusterStrategy`
- [ ] Build contextual semantic search with reranking
- [ ] Add "similar plays" API endpoint
- [ ] Create `DiscoverySidebar` component
- [ ] Add enrichment badges to `PlayCard`

**Deliverable**: Semantic discovery features in UI

### Phase 5: Advanced Features (Week 9-10)
- [ ] Implement co-occurrence network visualization
- [ ] Add temporal pattern detection (trending artists)
- [ ] Build "musical journey" feature (artist evolution over time)
- [ ] Create enrichment analytics dashboard
- [ ] Performance optimization and caching tuning

**Deliverable**: Full discovery experience

### Phase 6: Polish & Production (Week 11-12)
- [ ] Comprehensive testing of enrichment pipelines
- [ ] Error handling and retry logic refinement
- [ ] Documentation and API reference
- [ ] Monitoring and observability setup
- [ ] Deploy to production

**Deliverable**: Production-ready enrichment system

---

## 8. API Design

### 8.1 Enrichment API Endpoints

```typescript
// packages/api/src/enrichment-api.ts

export class EnrichmentApi extends Api.make({
  title: "KXP Enrichment API",
  version: "1.0.0"
}) {
  /**
   * Get artist statistics
   *
   * GET /api/enrichment/artist-stats?artist=Modest+Mouse
   */
  getArtistStats = Api.get("artistStats", "/enrichment/artist-stats")({
    request: {
      query: Schema.Struct({
        artist: Schema.String
      })
    },
    response: {
      status: 200,
      content: Schema.SuccessSchema(ArtistStatsEnrichment)
    }
  })

  /**
   * Get all enrichments for a play
   *
   * GET /api/enrichment/play/12345
   */
  getPlayEnrichments = Api.get("playEnrichments", "/enrichment/play/:playId")({
    request: {
      params: Schema.Struct({
        playId: Schema.NumberFromString
      })
    },
    response: {
      status: 200,
      content: Schema.SuccessSchema(Schema.Struct({
        play_id: Schema.Number,
        artist_stats: Schema.NullOr(ArtistStatsEnrichment),
        song_popularity: Schema.NullOr(SongPopularityEnrichment),
        new_play_analysis: Schema.NullOr(NewPlayEnrichment),
        similar_plays: Schema.Array(Schema.Struct({
          play_id: Schema.Number,
          artist: Schema.String,
          song: Schema.String,
          similarity: Schema.Number
        }))
      }))
    }
  })

  /**
   * Search with enrichments
   *
   * GET /api/enrichment/search?q=shoegaze&limit=20
   */
  searchWithEnrichments = Api.get("searchEnriched", "/enrichment/search")({
    request: {
      query: Schema.Struct({
        q: Schema.String,
        limit: Schema.NumberFromString.pipe(Schema.optional),
        offset: Schema.NumberFromString.pipe(Schema.optional),
        include_insights: Schema.BooleanFromString.pipe(Schema.optional)
      })
    },
    response: {
      status: 200,
      content: Schema.SuccessSchema(Schema.Struct({
        results: Schema.Array(EnrichedSearchResult),
        total: Schema.Number
      }))
    }
  })

  /**
   * Get similar plays (k-nearest neighbors)
   *
   * GET /api/enrichment/similar/12345?limit=10
   */
  getSimilarPlays = Api.get("similarPlays", "/enrichment/similar/:playId")({
    request: {
      params: Schema.Struct({
        playId: Schema.NumberFromString
      }),
      query: Schema.Struct({
        limit: Schema.NumberFromString.pipe(Schema.optional)
      })
    },
    response: {
      status: 200,
      content: Schema.SuccessSchema(Schema.Array(Schema.Struct({
        play: PlayResult,
        similarity: Schema.Number
      })))
    }
  })

  /**
   * Get co-occurring artists
   *
   * GET /api/enrichment/co-occurrence?artist=Modest+Mouse&limit=20
   */
  getCoOccurrence = Api.get("coOccurrence", "/enrichment/co-occurrence")({
    request: {
      query: Schema.Struct({
        artist: Schema.String,
        limit: Schema.NumberFromString.pipe(Schema.optional),
        min_strength: Schema.Literal("weak", "moderate", "strong").pipe(Schema.optional)
      })
    },
    response: {
      status: 200,
      content: Schema.SuccessSchema(Schema.Array(CoOccurrenceEnrichment))
    }
  })
}
```

---

## 9. Mind Map: Enrichment & Discovery Ecosystem

```
KXP Historical Crate Enrichment Architecture
│
├─ ENRICHMENT STRATEGIES
│  │
│  ├─ Static (Computed Once)
│  │  ├─ MusicBrainz Resolution → Genres, Tags, Artist Info
│  │  └─ Semantic Embeddings → 256d vectors for similarity
│  │
│  ├─ Aggregate (Computed Periodically)
│  │  ├─ Artist Statistics → Play counts, temporal patterns, rotation history
│  │  ├─ Song Popularity → Play frequency, peaks, comparative metrics
│  │  └─ Label/Genre Trends → Temporal analysis of labels/genres
│  │
│  ├─ Relational (Graph-Based)
│  │  ├─ Co-Occurrence Networks → Artists played together
│  │  ├─ Semantic Clusters → Groups of similar tracks
│  │  └─ Show/Host Affinities → Artist-show relationships
│  │
│  └─ Real-Time (Live Updates)
│     ├─ New Play Analysis → Debuts, returns, novelty
│     ├─ Trending Detection → Sudden upticks in plays
│     └─ Rotation Status Prediction → ML-based predictions
│
├─ COMPOSABLE PIPELINE
│  │
│  ├─ Core Abstraction: EnrichmentStrategy<E, R>
│  │  ├─ enrichPlay: Single play enrichment
│  │  ├─ enrichPlays: Batch enrichment (optimized)
│  │  └─ needsUpdate: Staleness check
│  │
│  ├─ Combinators (Higher-Order Functions)
│  │  ├─ parallel: Run multiple enrichments concurrently
│  │  ├─ sequential: Chain dependent enrichments
│  │  ├─ cached: Add TTL-based caching layer
│  │  ├─ withRetry: Exponential backoff for failures
│  │  └─ withTelemetry: Add spans and logging
│  │
│  └─ Composition Pattern
│     pipe(
│       makeMusicBrainzStrategy(),
│       cached(Duration.days(30)),
│       parallel(makeArtistStatsStrategy()),
│       withRetry(Schedule.exponential("100 millis")),
│       withTelemetry
│     )
│
├─ STREAM-BASED PROCESSING
│  │
│  ├─ Batch Enrichment Stream
│  │  ├─ Stream.paginateEffect for cursor-based batching
│  │  ├─ Enrich 100 plays at a time
│  │  ├─ Progress tracking and logging
│  │  └─ Graceful error handling
│  │
│  ├─ Real-Time Enrichment Stream
│  │  ├─ Subscribe to new plays from live polling
│  │  ├─ Enrich immediately as plays arrive
│  │  ├─ Store and invalidate reactivity keys
│  │  └─ Trigger automatic UI updates
│  │
│  └─ Integration with Effect Atom
│     New Play → Enrich → Store → Invalidate → Atom Updates → UI Re-renders
│
├─ SEARCH ENHANCEMENTS
│  │
│  ├─ Contextual Semantic Search
│  │  ├─ Base FAISS search (2x results)
│  │  ├─ Fetch enrichments for all results
│  │  ├─ Re-rank with enrichment signals:
│  │  │  ├─ Boost local artists (+10%)
│  │  │  ├─ Boost peak rotation periods (+5%)
│  │  │  └─ Gentle time decay for recency
│  │  └─ Return top N after reranking
│  │
│  ├─ Enriched Search Results
│  │  ├─ Include inline artist stats
│  │  ├─ Show song popularity metrics
│  │  ├─ Display similar plays
│  │  └─ Generate actionable insights
│  │
│  └─ Insight Generation
│     ├─ "First KEXP play"
│     ├─ "Peak rotation period"
│     ├─ "Rare track (only N plays)"
│     ├─ "Seattle/PNW artist"
│     └─ "Back after X years"
│
├─ FRONTEND INTEGRATION
│  │
│  ├─ Enrichment Atoms (Reactive State)
│  │  ├─ artistStatsAtom(artist) → Auto-updates on invalidation
│  │  ├─ playEnrichmentsAtom(playId) → Per-play enrichments
│  │  └─ similarPlaysAtom(playId, limit) → k-NN results
│  │
│  ├─ EnrichedPlayCard Component
│  │  ├─ Base PlayCard with album art, metadata
│  │  ├─ Enrichment badges (subtle, inline)
│  │  │  ├─ "First KEXP Play"
│  │  │  ├─ "Back after N years"
│  │  │  └─ "Peak Rotation"
│  │  └─ Collapsible artist stats footer
│  │
│  ├─ DiscoverySidebar Component
│  │  ├─ Similar Tracks (semantic neighbors)
│  │  ├─ Quick Searches ("More like this", "All plays by artist")
│  │  └─ Contextual prompts based on current play
│  │
│  └─ Timeline Enhancements
│     ├─ Inline insights as user scrolls
│     ├─ Visual markers for debuts, peaks, returns
│     └─ Smooth reactivity as enrichments load
│
├─ API DESIGN
│  │
│  ├─ Enrichment Endpoints
│  │  ├─ GET /api/enrichment/artist-stats?artist=...
│  │  ├─ GET /api/enrichment/play/:playId
│  │  ├─ GET /api/enrichment/search?q=...&include_insights=true
│  │  ├─ GET /api/enrichment/similar/:playId?limit=10
│  │  └─ GET /api/enrichment/co-occurrence?artist=...
│  │
│  └─ Type-Safe Client Generation
│     AtomHttpApi → Automatic client with Effect integration
│
└─ IMPLEMENTATION PHASES
   │
   ├─ Phase 1: Foundation (Weeks 1-2)
   │  └─ Core abstractions, artist stats PoC
   │
   ├─ Phase 2: Core Enrichments (Weeks 3-4)
   │  └─ Song popularity, batch processing
   │
   ├─ Phase 3: Real-Time Processing (Weeks 5-6)
   │  └─ Live enrichment stream, reactivity
   │
   ├─ Phase 4: Semantic Enhancements (Weeks 7-8)
   │  └─ Similarity clusters, discovery UI
   │
   ├─ Phase 5: Advanced Features (Weeks 9-10)
   │  └─ Co-occurrence networks, visualizations
   │
   └─ Phase 6: Polish & Production (Weeks 11-12)
      └─ Testing, monitoring, deployment
```

---

## 10. The KXP Experience: User Journeys

### Journey 1: The Curious Explorer

**User**: Sarah, 28, indie music fan, first time using KXP Historical Crate

**Flow**:
1. Lands on homepage, sees infinite timeline scrolling back to 2007
2. Scrolls casually, notices **subtle badges**: "First KEXP Play", "Seattle Artist"
3. Clicks on a play by **Fleet Foxes**, sees:
   - "First KEXP play: March 2008"
   - "127 total plays across 23 songs"
   - Collapsible stats show peak rotation in 2008-2009
4. Clicks "More like this" in sidebar
5. Discovers semantic search results with insight badges:
   - "Peak rotation period"
   - "Seattle/PNW artist"
6. Clicks on **Band of Horses**, repeats exploration
7. **Result**: Discovers 10 new artists in 15 minutes, all contextually related

### Journey 2: The Deep Diver

**User**: Marcus, 35, music journalist researching Seattle indie scene

**Flow**:
1. Searches for "Seattle indie rock 2008"
2. Gets enriched results with clustering insights
3. Notices co-occurrence badge: "Often played with Modest Mouse"
4. Clicks to explore Modest Mouse plays
5. Sees detailed artist stats:
   - First played: 1996
   - Peak rotation: 2004-2007
   - Recent return: 2023
6. Uses "Show co-occurring artists" feature
7. Discovers network of Seattle artists
8. **Result**: Builds narrative of Seattle music scene evolution

### Journey 3: The Live Listener

**User**: Jamie, 42, longtime KEXP listener, checking what's playing now

**Flow**:
1. Opens app while KEXP streams in background
2. Sees latest plays at top of timeline (live updates every 100s)
3. New play appears: **Fontaines D.C.**
4. Sees real-time enrichment badge: "Back after 8 months"
5. Clicks artist name, sees:
   - "5 plays total"
   - "First played: January 2024"
6. Uses "Similar tracks" to discover related post-punk bands
7. **Result**: Discovers new music inspired by current live broadcast

---

## 11. Technical Excellence: Why This Design Works

### Composability

The `EnrichmentStrategy` abstraction with higher-order combinators enables:
- **Mix and match**: Combine enrichments declaratively
- **Easy testing**: Test strategies in isolation
- **Incremental adoption**: Start simple, add complexity over time

### Reactivity

Effect Atom + Reactivity invalidation ensures:
- **Automatic UI updates**: No manual state management
- **Minimal re-renders**: Only affected atoms update
- **Type-safe**: Compile-time guarantees

### Streaming

Stream.paginateEffect for batch processing:
- **Memory efficient**: Process 2.2M plays without loading all into memory
- **Backpressure handling**: Buffer and concurrency control
- **Graceful errors**: Catch and log without crashing

### Type Safety

Schema validation throughout:
- **Decode at boundaries**: External data validated on ingress
- **Branded types**: Play IDs, dates, etc. have type-level guarantees
- **Exhaustive matching**: Pattern match on enrichment types

### Performance

- **Caching**: TTL-based caching reduces recomputation
- **Batching**: Batch enrichments for efficiency
- **Concurrency**: Parallel processing with Effect.all
- **Indexing**: Proper DB indices for enrichment queries

---

## 12. Success Metrics

### Engagement Metrics
- **Time on site**: Increase average session duration by 30%
- **Pages per session**: Increase plays viewed per session by 50%
- **Return rate**: Increase weekly active users by 25%

### Discovery Metrics
- **Search queries**: Increase semantic searches by 40%
- **Artist exploration**: Increase artist deep-dives by 60%
- **Similarity clicks**: Measure "More like this" click-through rate

### Technical Metrics
- **Enrichment coverage**: 95% of plays enriched within 24 hours
- **Real-time latency**: New plays enriched within 60 seconds
- **Cache hit rate**: 80%+ for enrichment queries

---

## Conclusion

This enrichment architecture transforms the KXP Historical Crate from a static timeline into a **living, breathing musical ecosystem**. By staying close to the data, using composable Effect-TS patterns, and surfacing insights subtly, we create an experience that:

- **Respects the crate philosophy**: Always chronological, infinite exploration
- **Enhances without intruding**: Breadcrumbs, not roadblocks
- **Scales effortlessly**: Stream-based processing for millions of plays
- **Invites discovery**: Every play is a portal to deeper exploration

The result: Users don't just browse plays—they **discover stories, trace musical lineages, and fall down delightful rabbit holes** in 18 years of KEXP history.

---

*Document Version: 1.0.0*
*Author: KXP Engineering Team*
*Date: 2025-11-19*
