/**
 * Generated Assets Atoms
 *
 * Effect Atom-based state management for AI-generated visual assets.
 * Uses TimelineRuntime.atom pattern matching insights.ts.
 *
 * @module
 */

import { Atom, Result } from "@effect-atom/atom-react"
import { Effect, Schema, Option, Duration } from "effect"
import { HttpClient, HttpClientResponse } from "@effect/platform"
import { TimelineRuntime } from "@/lib/http-runtime"

// ============================================================================
// Constants
// ============================================================================

const ASSET_CACHE_KEY_PREFIX = "timeline:assets:"
const ASSET_CACHE_TTL = Duration.hours(1)

// API base URL for generated assets endpoint (FAISS API)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ""

// ============================================================================
// Types & Schemas
// ============================================================================

/**
 * Asset metadata from generation params
 */
export const AssetMetadata = Schema.Struct({
  era: Schema.optional(Schema.String),
  style: Schema.optional(Schema.String),
  placement: Schema.optional(Schema.String),
  page_number: Schema.optional(Schema.Number),
  mood: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
})
export type AssetMetadata = Schema.Schema.Type<typeof AssetMetadata>

/**
 * Generated asset from the API
 */
export const GeneratedAsset = Schema.Struct({
  id: Schema.String,
  play_id: Schema.Number,
  asset_type: Schema.String,
  image_url: Schema.String,
  thumbnail_url: Schema.optional(Schema.String),
  metadata: AssetMetadata,
  created_at: Schema.String,
})
export type GeneratedAsset = Schema.Schema.Type<typeof GeneratedAsset>

/**
 * API response format
 */
const GeneratedAssetsResponse = Schema.Struct({
  play_id: Schema.Number,
  assets: Schema.Array(GeneratedAsset),
  count: Schema.Number,
})

/**
 * Cache entry schema
 */
const AssetCacheEntry = Schema.Struct({
  data: Schema.Array(GeneratedAsset),
  timestamp: Schema.Number,
  playId: Schema.Number,
})
type AssetCacheEntry = Schema.Schema.Type<typeof AssetCacheEntry>

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Get cached assets from localStorage.
 * Returns Option.none() if cache miss or expired.
 */
const getCachedAssets = (
  playId: number
): Effect.Effect<Option.Option<readonly GeneratedAsset[]>> =>
  Effect.try(() => {
    const cached = localStorage.getItem(`${ASSET_CACHE_KEY_PREFIX}${playId}`)
    if (!cached) return Option.none<readonly GeneratedAsset[]>()

    const parsed = JSON.parse(cached)
    const decoded = Schema.decodeUnknownSync(AssetCacheEntry)(parsed)

    // Check TTL
    const age = Date.now() - decoded.timestamp
    const ttlMs = Duration.toMillis(ASSET_CACHE_TTL)

    if (age > ttlMs) {
      return Option.none<readonly GeneratedAsset[]>()
    }

    return Option.some(decoded.data)
  }).pipe(
    Effect.catchAll(() => Effect.succeed(Option.none<readonly GeneratedAsset[]>()))
  )

/**
 * Store assets in localStorage cache.
 */
const cacheAssets = (
  playId: number,
  assets: readonly GeneratedAsset[]
): Effect.Effect<void> =>
  Effect.try(() => {
    const cacheEntry: AssetCacheEntry = {
      data: [...assets],
      timestamp: Date.now(),
      playId,
    }
    localStorage.setItem(
      `${ASSET_CACHE_KEY_PREFIX}${playId}`,
      JSON.stringify(cacheEntry)
    )
  }).pipe(Effect.ignore)

// ============================================================================
// Fetch Effect
// ============================================================================

/**
 * Fetch generated assets for a play from the FAISS API.
 * Checks cache first, fetches if miss, caches result.
 */
const fetchGeneratedAssets = (
  playId: number
): Effect.Effect<readonly GeneratedAsset[], Error, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    // Check cache first
    const cached = yield* getCachedAssets(playId)
    if (Option.isSome(cached)) {
      yield* Effect.logDebug(`Cache hit for assets play ${playId}`)
      return cached.value
    }

    yield* Effect.logDebug(`Cache miss, fetching assets for play ${playId}`)

    const client = yield* HttpClient.HttpClient
    const response = yield* client
      .get(`${API_BASE_URL}/api/generated-assets/play/${playId}`)
      .pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(GeneratedAssetsResponse)),
        Effect.map((resp) => resp.assets),
        Effect.tap((assets) =>
          Effect.logDebug(`Fetched ${assets.length} assets for play ${playId}`)
        ),
        Effect.tapError((e) =>
          Effect.logWarning(`Failed to fetch assets for play ${playId}: ${e}`)
        )
      )

    // Cache the result
    yield* cacheAssets(playId, response)

    return response
  })

// ============================================================================
// Atoms
// ============================================================================

/**
 * Atom family for generated assets by play ID.
 * Returns Result with loading/success/error states.
 *
 * Usage:
 * ```tsx
 * const assetsResult = useAtomValue(generatedAssetsAtom(playId))
 * Result.matchWithWaiting(assetsResult, { ... })
 * ```
 */
export const generatedAssetsAtom = Atom.family((playId: number) =>
  TimelineRuntime.atom(
    fetchGeneratedAssets(playId).pipe(
      Effect.mapError((e) => new Error(`Asset fetch failed: ${e}`))
    )
  ).pipe(Atom.withReactivity([`timeline:play:${playId}`]))
)

/**
 * Convenience atom that extracts just the assets array.
 * Returns empty array on loading/error (for components that don't need Result handling).
 *
 * Usage:
 * ```tsx
 * const assets = useAtomValue(generatedAssetsArrayAtom(playId))
 * // assets is always an array, empty if loading/error
 * ```
 */
export const generatedAssetsArrayAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const result = get.get(generatedAssetsAtom(playId))
    return Result.matchWithWaiting(result, {
      onWaiting: () => [] as readonly GeneratedAsset[],
      onSuccess: (s) => s.value,
      onError: () => [] as readonly GeneratedAsset[],
      onDefect: () => [] as readonly GeneratedAsset[],
    })
  })
)

/**
 * Loading state atom for generated assets.
 */
export const generatedAssetsLoadingAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const result = get.get(generatedAssetsAtom(playId))
    return Result.matchWithWaiting(result, {
      onWaiting: () => true,
      onSuccess: () => false,
      onError: () => false,
      onDefect: () => false,
    })
  })
)
