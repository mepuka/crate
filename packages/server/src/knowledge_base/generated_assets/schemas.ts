import { Schema } from "effect"

/**
 * Era types for visual styling context
 */
export const Era = Schema.Literal(
  "pre-vinyl",
  "golden-age",
  "classic-rock",
  "new-wave",
  "grunge",
  "digital",
  "streaming",
  "contemporary"
)
export type Era = Schema.Schema.Type<typeof Era>

/**
 * Asset placement in physical media context
 */
export const AssetPlacement = Schema.Literal(
  "front",
  "back",
  "inner",
  "label",
  "booklet_page",
  "j_card"
)
export type AssetPlacement = Schema.Schema.Type<typeof AssetPlacement>

/**
 * Types of generated assets - open string to allow model to create new types over time
 * Common types include: liner_note, enhanced_art, show_graphic, character, gatefold, insert, etc.
 */
export const AssetType = Schema.String
export type AssetType = Schema.Schema.Type<typeof AssetType>

/**
 * Metadata extracted from generation params
 * All fields optional - populated based on what the model provides
 */
export const AssetMetadata = Schema.Struct({
  era: Schema.optional(Schema.String),
  placement: Schema.optional(Schema.String),
  page_number: Schema.optional(Schema.Number),
  // Allow additional semantic metadata from the model
  style: Schema.optional(Schema.String),
  mood: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String)
})
export type AssetMetadata = Schema.Schema.Type<typeof AssetMetadata>

/**
 * Database row schema (what we read from SQLite)
 */
export const GeneratedAssetRow = Schema.Struct({
  id: Schema.Number,
  play_id: Schema.NullOr(Schema.Number),
  asset_type: Schema.String,
  params_hash: Schema.String,
  generation_params: Schema.NullOr(Schema.String),
  image_base64: Schema.String,
  mime_type: Schema.String,
  era: Schema.NullOr(Schema.String),
  style: Schema.NullOr(Schema.String),
  model_notes: Schema.NullOr(Schema.String),
  prompt_used: Schema.NullOr(Schema.String),
  gcs_url: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String
})
export type GeneratedAssetRow = Schema.Schema.Type<typeof GeneratedAssetRow>

/**
 * API response schema (what we return to frontend)
 */
export const GeneratedAsset = Schema.Struct({
  id: Schema.String,
  play_id: Schema.Number,
  asset_type: AssetType,
  image_url: Schema.String,
  thumbnail_url: Schema.optional(Schema.String),
  metadata: AssetMetadata,
  created_at: Schema.String
})
export type GeneratedAsset = Schema.Schema.Type<typeof GeneratedAsset>

/**
 * Input schema for storing a new generated asset
 */
export const StoreAssetInput = Schema.Struct({
  play_id: Schema.optional(Schema.Number),
  asset_type: AssetType,
  params_hash: Schema.String,
  generation_params: Schema.optional(Schema.String),
  image_base64: Schema.String,
  mime_type: Schema.optionalWith(Schema.String, { default: () => "image/png" }),
  era: Schema.optional(Schema.String),
  style: Schema.optional(Schema.String),
  model_notes: Schema.optional(Schema.String),
  prompt_used: Schema.optional(Schema.String),
  /** GCS public URL for production serving */
  gcs_url: Schema.optional(Schema.String)
})
export type StoreAssetInput = Schema.Schema.Type<typeof StoreAssetInput>

/**
 * Response schema for store operation
 */
export const StoreAssetResponse = Schema.Struct({
  id: Schema.Number,
  params_hash: Schema.String,
  was_existing: Schema.Boolean
})
export type StoreAssetResponse = Schema.Schema.Type<typeof StoreAssetResponse>

/**
 * Transform database row to API response
 * Extracts semantic metadata from generation_params JSON
 */
export const transformRowToAsset = (row: GeneratedAssetRow): GeneratedAsset | null => {
  // Skip rows without play_id (artist-level assets not yet supported in frontend)
  if (row.play_id === null) return null

  // Parse generation_params to extract semantic metadata
  let placement: string | undefined
  let pageNumber: number | undefined
  let mood: string | undefined
  let description: string | undefined

  if (row.generation_params) {
    try {
      const params = JSON.parse(row.generation_params)
      placement = params.placement
      pageNumber = params.page_number
      mood = params.mood
      description = params.description
    } catch {
      // Ignore parse errors
    }
  }

  // Determine image URL: prefer GCS, fallback to data URL
  const imageUrl = row.gcs_url || `data:${row.mime_type};base64,${row.image_base64}`

  return {
    id: String(row.id),
    play_id: row.play_id,
    asset_type: row.asset_type,
    image_url: imageUrl,
    metadata: {
      era: row.era ?? undefined,
      style: row.style ?? undefined,
      placement,
      page_number: pageNumber,
      mood,
      description
    },
    created_at: row.created_at
  }
}
