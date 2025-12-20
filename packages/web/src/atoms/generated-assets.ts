/**
 * Generated Assets Atom
 *
 * Fetches AI-generated visual assets (liner notes, etc.) for a play.
 * Uses Effect-based atoms with TimelineRuntime.
 *
 * @module
 */

import { Atom, Result } from "@effect-atom/atom"
import { Effect, Option, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"
import { TimelineRuntime } from "@/lib/http-runtime"

// API base URL (same as other API calls)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ""

// ============================================================================
// Types (matching server schema)
// ============================================================================

/**
 * Asset metadata from generation params
 */
interface AssetMetadata {
  readonly era?: string
  readonly style?: string
  readonly placement?: string
  readonly page_number?: number
  readonly mood?: string
  readonly description?: string
}

/**
 * Generated asset from the API
 */
export interface GeneratedAsset {
  readonly id: string
  readonly play_id: number
  readonly asset_type: string
  readonly image_url: string
  readonly thumbnail_url?: string
  readonly metadata: AssetMetadata
  readonly created_at: string
}

// Schema for API response validation
const AssetMetadataSchema = Schema.Struct({
  era: Schema.optional(Schema.String),
  style: Schema.optional(Schema.String),
  placement: Schema.optional(Schema.String),
  page_number: Schema.optional(Schema.Number),
  mood: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String)
})

const GeneratedAssetSchema = Schema.Struct({
  id: Schema.String,
  play_id: Schema.Number,
  asset_type: Schema.String,
  image_url: Schema.String,
  thumbnail_url: Schema.optional(Schema.String),
  metadata: AssetMetadataSchema,
  created_at: Schema.String
})

const GeneratedAssetsResponseSchema = Schema.Array(GeneratedAssetSchema)

// ============================================================================
// Fetch Effect
// ============================================================================

/**
 * Effect that fetches generated assets for a play ID
 */
const fetchGeneratedAssetsEffect = (playId: number) =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Fetching generated assets for play ${playId}`)

    const client = yield* HttpClient.HttpClient

    const response = yield* client
      .get(`${API_BASE_URL}/api/plays/generated-assets`)
      .pipe(
        HttpClient.mapRequest(
          HttpClientRequest.setUrlParams({ play_id: String(playId) })
        ),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(GeneratedAssetsResponseSchema)),
        Effect.tap((assets) =>
          Effect.logDebug(`Fetched ${assets.length} generated assets for play ${playId}`)
        ),
        Effect.mapError((e) => ({
          _tag: "GeneratedAssetsError" as const,
          message: `Failed to fetch generated assets: ${e}`,
          playId
        }))
      )

    return response
  }).pipe(Effect.provide(FetchHttpClient.layer))

// ============================================================================
// Atoms
// ============================================================================

/**
 * Family atom for fetching generated assets by play ID
 *
 * Usage:
 * ```tsx
 * const assetsResult = useAtomValue(generatedAssetsAtom(playId))
 * Result.matchWithWaiting(assetsResult, { ... })
 * ```
 */
export const generatedAssetsAtom = Atom.family((playId: number) =>
  TimelineRuntime.atom(
    fetchGeneratedAssetsEffect(playId).pipe(
      // Cache for 5 minutes to avoid refetching on every render
      Effect.cachedWithTTL("5 minutes"),
      Effect.flatten
    )
  )
)

/**
 * Derived atom that extracts just the assets array (empty on loading/error)
 *
 * Usage when you just need the array without handling Result:
 * ```tsx
 * const assets = useAtomValue(generatedAssetsArrayAtom(playId))
 * // assets is always an array, empty if loading or error
 * ```
 */
export const generatedAssetsArrayAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const result = get.get(generatedAssetsAtom(playId))
    return Result.matchWithWaiting(result, {
      onWaiting: () => [] as readonly GeneratedAsset[],
      onSuccess: (s) => s.value,
      onError: () => [] as readonly GeneratedAsset[],
      onDefect: () => [] as readonly GeneratedAsset[]
    })
  })
)

/**
 * Loading state for generated assets
 */
export const generatedAssetsLoadingAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const result = get.get(generatedAssetsAtom(playId))
    return Result.matchWithWaiting(result, {
      onWaiting: () => true,
      onSuccess: () => false,
      onError: () => false,
      onDefect: () => false
    })
  })
)
