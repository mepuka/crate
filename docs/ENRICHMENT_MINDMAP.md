# KXP Enrichment System: Visual Mind Map

## 🎯 Core Vision

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   "Stay close to the data. Stay close to the crate.           │
│    Subtle enhancements that draw users deeper into             │
│    musical discovery through 18 years of KEXP history."        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ENRICHMENT ECOSYSTEM                            │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                 ┌─────────────────┼─────────────────┐
                 │                 │                 │
                 ▼                 ▼                 ▼
        ┌────────────────┐ ┌──────────────┐ ┌──────────────┐
        │   STRATEGIES   │ │   PIPELINES  │ │  PRESENTATION│
        │   (What/When)  │ │     (How)    │ │    (Where)   │
        └────────────────┘ └──────────────┘ └──────────────┘
                 │                 │                 │
                 │                 │                 │
    ┌────────────┼────────────┐    │    ┌────────────┼────────────┐
    │            │            │    │    │            │            │
    ▼            ▼            ▼    ▼    ▼            ▼            ▼
┌───────┐  ┌───────┐  ┌───────┐ Stream Atoms     UI        Search
│Static │  │Aggre- │  │Rela-  │        │      Components   Results
│       │  │gate   │  │tional │        │         │           │
└───────┘  └───────┘  └───────┘        │         │           │
    │          │          │             │         │           │
    │          │          │             │         │           │
    ▼          ▼          ▼             ▼         ▼           ▼
  MBIDs    Artist     Co-occur   Effect.gen   PlayCard   Insights
  Embed    Stats      Network        │           │           │
  Genre    Song       Clusters       │           │           │
           Popular    Similar        │           │           │
                                     │           │           │
                                     ▼           ▼           ▼
                            ┌────────────────────────────────────┐
                            │   REACTIVE STATE (Effect Atom)     │
                            │                                    │
                            │  TimelineKVS → Reactivity.invalidate
                            │       ↓                            │
                            │  Atoms re-evaluate                 │
                            │       ↓                            │
                            │  React components re-render        │
                            └────────────────────────────────────┘
```

## 📊 Enrichment Types Hierarchy

```
ENRICHMENTS
│
├─ 📦 STATIC (Computed Once, Cached Forever)
│  │
│  ├─ 🎵 MusicBrainz Resolution
│  │  ├─ Artist MBID
│  │  ├─ Release MBID
│  │  ├─ Recording MBID
│  │  ├─ Genres & Tags
│  │  ├─ Artist Country
│  │  └─ Release Date
│  │
│  └─ 🧠 Semantic Embeddings
│     ├─ 256d vector
│     ├─ Model: mpnet-v1-pca256
│     └─ Generated via Colab
│
├─ 📈 AGGREGATE (Computed Periodically, TTL: 24h)
│  │
│  ├─ 👤 Artist Statistics
│  │  ├─ Total plays
│  │  ├─ Unique songs/albums
│  │  ├─ First/Last play date
│  │  ├─ Peak rotation period
│  │  ├─ Avg plays per month
│  │  └─ Is local artist
│  │
│  ├─ 🎼 Song Popularity
│  │  ├─ Total plays
│  │  ├─ Temporal distribution
│  │  │  ├─ By year
│  │  │  ├─ By month
│  │  │  └─ By week
│  │  ├─ Peak week
│  │  └─ Percentile rank
│  │
│  └─ 🏷️ Label/Genre Trends
│     ├─ Label popularity over time
│     ├─ Genre emergence patterns
│     └─ Rotation status correlations
│
├─ 🕸️ RELATIONAL (Graph-Based, TTL: 7d)
│  │
│  ├─ 🔗 Co-Occurrence Network
│  │  ├─ Artist pairs
│  │  ├─ Jaccard similarity
│  │  ├─ Typical time gap
│  │  ├─ Common shows/hosts
│  │  └─ Strength: weak/moderate/strong
│  │
│  ├─ 🎯 Semantic Clusters
│  │  ├─ Cluster ID & label
│  │  ├─ K-nearest neighbors
│  │  ├─ Cluster size/cohesion
│  │  └─ Representative tracks
│  │
│  └─ 📻 Show/Host Affinities
│     ├─ Artist → Show associations
│     ├─ Artist → Host associations
│     └─ Probability scores
│
└─ ⚡ REAL-TIME (Computed on Arrival, No Cache)
   │
   ├─ 🆕 New Play Analysis
   │  ├─ Is artist debut
   │  ├─ Is song debut
   │  ├─ Days since last play
   │  └─ Novelty score
   │
   ├─ 📊 Trending Detection
   │  ├─ Recent play velocity
   │  ├─ Comparative to historical avg
   │  └─ Spike detection
   │
   └─ 🔮 Predictions
      ├─ Predicted rotation status
      ├─ Likelihood of repeat play
      └─ Expected next play date
```

## 🔄 Data Flow: From Play to Enriched UI

```
┌─────────────┐
│  New Play   │  ← KEXP API poll (every 100s)
│   Arrives   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Store in TimelineKVS               │
│  (Chunk<PlayResult> + HashSet)      │
└──────┬──────────────────────────────┘
       │
       ├──────────────────────┬─────────────────────┐
       │                      │                     │
       ▼                      ▼                     ▼
┌──────────────┐      ┌─────────────┐      ┌──────────────┐
│ BATCH        │      │ REAL-TIME   │      │ USER         │
│ ENRICHMENT   │      │ ENRICHMENT  │      │ INTERACTION  │
│              │      │             │      │              │
│ (Stream.     │      │ (Stream.    │      │ (Clicks,     │
│  paginate)   │      │  async)     │      │  searches)   │
└──────┬───────┘      └──────┬──────┘      └──────┬───────┘
       │                     │                    │
       │  100 plays/batch    │  Single play       │  playId
       │                     │                    │
       ▼                     ▼                    ▼
┌────────────────────────────────────────────────────────┐
│              ENRICHMENT PIPELINE                       │
│                                                        │
│  pipe(                                                 │
│    makeMusicBrainzStrategy(),                          │
│    cached(30d),                                        │
│    parallel(makeArtistStatsStrategy()),                │
│    parallel(makeSongPopularityStrategy()),             │
│    sequential((mb) => makeSimilarityStrategy(mb)),     │
│    withRetry(exponential),                             │
│    withTelemetry                                       │
│  )                                                     │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│             ENRICHMENT STORE (SQLite)                  │
│                                                        │
│  Tables:                                               │
│  ├─ musicbrainz_enrichments                            │
│  ├─ artist_stats_enrichments                           │
│  ├─ song_popularity_enrichments                        │
│  ├─ similarity_clusters                                │
│  └─ co_occurrence_enrichments                          │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│       Reactivity.invalidate([                          │
│         `enrichment:play:${playId}`,                   │
│         `enrichment:artist:${artist}`,                 │
│         "enrichment:timeline"                          │
│       ])                                               │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│              EFFECT ATOMS RE-EVALUATE                  │
│                                                        │
│  playEnrichmentsAtom(playId)                           │
│    .pipe(Atom.withReactivity([                         │
│      `enrichment:play:${playId}`                       │
│    ]))                                                 │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│            REACT COMPONENT RE-RENDERS                  │
│                                                        │
│  <EnrichedPlayCard play={play} />                      │
│    ├─ Base metadata                                    │
│    ├─ Enrichment badges                                │
│    │  ├─ "First KEXP Play"                             │
│    │  ├─ "Back after 2 years"                          │
│    │  └─ "Peak Rotation"                               │
│    └─ Artist stats (collapsible)                       │
│                                                        │
│  <DiscoverySidebar />                                  │
│    ├─ Similar tracks (k-NN)                            │
│    └─ Quick searches                                   │
└────────────────────────────────────────────────────────┘
```

## 🎨 UX Enhancement Patterns

```
DISCOVERY BREADCRUMBS
│
├─ 🏷️ Inline Badges (Subtle, Non-Intrusive)
│  │
│  ├─ Temporal
│  │  ├─ "First KEXP Play" (debut)
│  │  ├─ "Back after X years" (return)
│  │  └─ "Peak Rotation: 2008-Q2" (context)
│  │
│  ├─ Identity
│  │  ├─ "Seattle/PNW Artist" (local)
│  │  ├─ "Heavy Rotation" (status)
│  │  └─ "New Music Monday" (program)
│  │
│  └─ Rarity
│     ├─ "Rare track (3 plays)" (scarcity)
│     └─ "Often with Modest Mouse" (co-occur)
│
├─ 📊 Collapsible Stats (On-Demand Detail)
│  │
│  ├─ Artist Overview
│  │  ├─ Total plays: 127
│  │  ├─ Unique songs: 23
│  │  ├─ Active: 2008-2023
│  │  └─ Peak: Dec 2008 (45 plays)
│  │
│  └─ Song Journey
│     ├─ First played: Mar 2008
│     ├─ Last played: Jan 2024
│     └─ Play distribution chart
│
├─ 🔍 Contextual Actions (Clickable Insights)
│  │
│  ├─ "More like this" → Semantic search
│  ├─ "All plays by X" → Artist filter
│  ├─ "Show co-occurring artists" → Graph view
│  └─ "Jump to first play" → Timeline navigation
│
└─ 🎯 Discovery Sidebar (Persistent Context)
   │
   ├─ Similar Tracks (k=5)
   │  ├─ Artist + Song
   │  ├─ Similarity %
   │  └─ Click to navigate
   │
   ├─ Related Artists
   │  └─ Co-occurrence network
   │
   └─ Suggested Searches
      ├─ "More shoegaze from 2009"
      ├─ "Seattle indie rock"
      └─ "Similar to [current play]"
```

## 🛠️ Implementation Stack

```
TECHNOLOGY LAYERS
│
├─ 🎨 FRONTEND (React + Effect Atom)
│  │
│  ├─ Components
│  │  ├─ EnrichedPlayCard.tsx
│  │  ├─ DiscoverySidebar.tsx
│  │  ├─ InsightBadge.tsx
│  │  └─ ArtistStatsPanel.tsx
│  │
│  ├─ Atoms (Reactive State)
│  │  ├─ playEnrichmentsAtom(playId)
│  │  ├─ artistStatsAtom(artist)
│  │  └─ similarPlaysAtom(playId)
│  │
│  └─ Hooks
│     ├─ useAtomValue(atom)
│     └─ useAtomSuspense(atom)
│
├─ 🔧 DOMAIN (Effect-TS Services)
│  │
│  ├─ Enrichment Pipeline
│  │  ├─ EnrichmentStrategy<E, R>
│  │  ├─ Combinators (parallel, cached, retry)
│  │  └─ Concrete strategies
│  │
│  ├─ Schemas
│  │  ├─ ArtistStatsEnrichment
│  │  ├─ SongPopularityEnrichment
│  │  ├─ CoOccurrenceEnrichment
│  │  └─ EnrichedSearchResult
│  │
│  └─ Services
│     ├─ EnrichmentStore
│     ├─ ArtistStatsService
│     └─ SimilarityService
│
├─ 🌐 API (Effect HTTP Router)
│  │
│  ├─ Endpoints
│  │  ├─ GET /enrichment/artist-stats
│  │  ├─ GET /enrichment/play/:id
│  │  ├─ GET /enrichment/search
│  │  └─ GET /enrichment/similar/:id
│  │
│  └─ Client (AtomHttpApi)
│     └─ Type-safe, auto-generated
│
├─ 🗄️ DATABASE (SQLite + Effect SQL)
│  │
│  ├─ Tables
│  │  ├─ musicbrainz_enrichments
│  │  ├─ artist_stats
│  │  ├─ song_popularity
│  │  ├─ similarity_clusters
│  │  └─ co_occurrence
│  │
│  └─ Migrations
│     └─ 30_enrichment_schema.sql
│
└─ 🔄 AGENT (Background Workers)
   │
   ├─ Batch Enrichment Stream
   │  ├─ 100 plays per batch
   │  ├─ Progress logging
   │  └─ Error recovery
   │
   └─ Real-Time Stream
      ├─ Poll every 30s
      ├─ Enrich new plays
      └─ Invalidate reactivity
```

## 🎯 Priority Implementation Roadmap

```
PHASE 1: Foundation (Weeks 1-2)
├─ ✓ Define EnrichmentStrategy interface
├─ ✓ Build EnrichmentStore (SQLite)
├─ ✓ Create combinators (parallel, cached)
├─ ✓ Implement ArtistStatsStrategy (PoC)
└─ ✓ Add DB migrations

PHASE 2: Core Enrichments (Weeks 3-4)
├─ ○ Implement SongPopularityStrategy
├─ ○ Implement NewPlayEnrichmentStrategy
├─ ○ Build batch enrichment stream
├─ ○ CLI command for batch processing
└─ ○ Enrich first 100K plays

PHASE 3: Real-Time (Weeks 5-6)
├─ ○ Real-time enrichment stream
├─ ○ Integrate with live polling
├─ ○ CoOccurrenceStrategy
├─ ○ Reactivity invalidation
└─ ○ Wire frontend atoms

PHASE 4: Semantic (Weeks 7-8)
├─ ○ SimilarityClusterStrategy
├─ ○ Contextual search with reranking
├─ ○ Similar plays endpoint
├─ ○ DiscoverySidebar component
└─ ○ EnrichedPlayCard badges

PHASE 5: Advanced (Weeks 9-10)
├─ ○ Co-occurrence visualization
├─ ○ Trending detection
├─ ○ Musical journey feature
└─ ○ Performance optimization

PHASE 6: Polish (Weeks 11-12)
├─ ○ Comprehensive testing
├─ ○ Error handling refinement
├─ ○ Documentation
├─ ○ Monitoring setup
└─ ○ Production deployment
```

## 🎪 User Journey Examples

```
JOURNEY 1: The Curious Explorer
│
Sarah (28, indie fan) → First time user
│
├─ Scrolls timeline
├─ Sees badge: "First KEXP Play"
├─ Clicks Fleet Foxes
│  └─ Stats: 127 plays, peak 2008
├─ Clicks "More like this"
├─ Discovers Band of Horses
└─ Falls down rabbit hole
   └─ 10 new artists in 15 minutes ✓

JOURNEY 2: The Deep Diver
│
Marcus (35, music journalist) → Researching
│
├─ Searches "Seattle indie rock 2008"
├─ Gets clustered results
├─ Sees co-occurrence: "Often with Modest Mouse"
├─ Explores Modest Mouse timeline
│  └─ First play: 1996
│  └─ Peak: 2004-2007
├─ Uses "Show co-occurring artists"
├─ Discovers artist network
└─ Builds narrative of scene evolution ✓

JOURNEY 3: The Live Listener
│
Jamie (42, longtime listener) → Live mode
│
├─ Opens app during live broadcast
├─ Sees live updates
├─ New play: Fontaines D.C.
│  └─ Badge: "Back after 8 months"
├─ Clicks artist
│  └─ 5 total plays
│  └─ First: Jan 2024
├─ Uses "Similar tracks"
└─ Discovers related post-punk ✓
```

## 🎓 Effect-TS Patterns Used

```
CORE PATTERNS
│
├─ Effect.gen (Generator Syntax)
│  └─ yield* for sequential async
│
├─ Services with `never` Requirements
│  └─ All deps via layers
│
├─ Schema Validation
│  └─ Decode at boundaries
│
├─ Tagged Errors
│  └─ EnrichmentError with context
│
├─ Stream.paginateEffect
│  └─ Cursor-based iteration
│
├─ Effect.all with concurrency
│  └─ Parallel enrichment
│
├─ Effect Atom + Reactivity
│  └─ Automatic UI updates
│
└─ Layer Composition
   └─ Service dependency graph
```

## 📈 Success Metrics

```
ENGAGEMENT
├─ Time on site: +30%
├─ Plays per session: +50%
└─ Weekly active users: +25%

DISCOVERY
├─ Semantic searches: +40%
├─ Artist deep-dives: +60%
└─ "More like this" CTR: measure

TECHNICAL
├─ Enrichment coverage: 95% within 24h
├─ Real-time latency: <60s
└─ Cache hit rate: 80%+
```

---

**This mind map visualizes the complete enrichment architecture for the KXP Historical Crate, designed to transform passive browsing into active musical discovery through subtle, data-driven enhancements.**
