/**
 * GeneratedAssetRepository
 *
 * Repository service for persisting and retrieving generated visual assets.
 * Works with the generated_assets table created by migration 0030.
 *
 * @module
 */

import { Context, Effect, Layer, Schema, Data, Option, pipe } from "effect";
import { SqlClient } from "@effect/sql";
import * as crypto from "node:crypto";

// =============================================================================
// Types & Schemas
// =============================================================================

/**
 * Asset types - semantic strings, model-derived
 * The model names what it creates (e.g., "liner_note", "gatefold_spread", "label_art", "inner_sleeve")
 */
export const AssetType = Schema.String;
export type AssetType = string;

/**
 * Generation parameters for hashing/deduplication
 * Also stores semantic metadata that the model provides
 */
export interface GenerationParams {
  readonly style?: string;
  readonly releaseYear?: number | null;
  readonly narrative?: string;
  readonly artistMbid?: string;
  // Semantic metadata from the model
  readonly placement?: string; // e.g., "front", "back", "inner", "gatefold_left"
  readonly mood?: string; // e.g., "nostalgic", "energetic", "introspective"
  readonly description?: string; // Model's description of what it created
  readonly page_number?: number; // For multi-page assets
}

/**
 * Schema for stored asset record
 */
export const GeneratedAssetRecord = Schema.Struct({
  id: Schema.Number,
  play_id: Schema.NullOr(Schema.Number),
  asset_type: AssetType,
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
  updated_at: Schema.String,
});
export type GeneratedAssetRecord = typeof GeneratedAssetRecord.Type;

/**
 * Input for storing a new asset
 */
export interface StoreAssetInput {
  readonly playId?: number;
  readonly assetType: AssetType;
  readonly params: GenerationParams;
  readonly imageBase64: string;
  readonly mimeType?: string;
  readonly era?: string;
  readonly style?: string;
  readonly modelNotes?: string;
  readonly promptUsed?: string;
}

/**
 * Result from store operation
 */
export interface StoreAssetResult {
  readonly id: number;
  readonly paramsHash: string;
  readonly wasExisting: boolean;
}

// =============================================================================
// Errors
// =============================================================================

export class AssetRepositoryError extends Data.TaggedError(
  "AssetRepositoryError"
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a deterministic hash for generation params
 */
export function hashParams(params: GenerationParams): string {
  const normalized = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Sentinel value for artist-level assets (no play_id).
 * SQLite NULL values don't work with UNIQUE constraints, so we use 0.
 */
const ARTIST_LEVEL_PLAY_ID = 0;

/**
 * Normalize playId for storage: undefined/null becomes sentinel value
 */
function normalizePlayId(playId: number | undefined | null): number {
  return playId ?? ARTIST_LEVEL_PLAY_ID;
}

// =============================================================================
// Service Interface
// =============================================================================

export interface GeneratedAssetRepositoryInterface {
  /**
   * Store a generated asset. If an asset with the same play_id, type, and params
   * already exists, returns the existing record without storing.
   */
  readonly store: (
    input: StoreAssetInput
  ) => Effect.Effect<StoreAssetResult, AssetRepositoryError>;

  /**
   * Get an asset by play_id and type (returns most recent if multiple)
   */
  readonly getByPlay: (
    playId: number,
    assetType: AssetType
  ) => Effect.Effect<Option.Option<GeneratedAssetRecord>, AssetRepositoryError>;

  /**
   * Get an asset by exact params hash
   */
  readonly getByParamsHash: (
    playId: number | undefined,
    assetType: AssetType,
    paramsHash: string
  ) => Effect.Effect<Option.Option<GeneratedAssetRecord>, AssetRepositoryError>;

  /**
   * Check if asset exists for given params (without fetching full data)
   */
  readonly exists: (
    playId: number | undefined,
    assetType: AssetType,
    params: GenerationParams
  ) => Effect.Effect<boolean, AssetRepositoryError>;

  /**
   * Update GCS URL for an asset (after upload to cloud storage)
   */
  readonly updateGcsUrl: (
    id: number,
    gcsUrl: string
  ) => Effect.Effect<void, AssetRepositoryError>;
}

/**
 * GeneratedAssetRepository tag
 */
export class GeneratedAssetRepository extends Context.Tag(
  "GeneratedAssetRepository"
)<GeneratedAssetRepository, GeneratedAssetRepositoryInterface>() {}

// =============================================================================
// Live Implementation
// =============================================================================

const makeGeneratedAssetRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const store = (
    input: StoreAssetInput
  ): Effect.Effect<StoreAssetResult, AssetRepositoryError> =>
    Effect.gen(function* () {
      const paramsHash = hashParams(input.params);
      const paramsJson = JSON.stringify(input.params);

      // Check if exists first (use normalized play_id for SQLite UNIQUE constraint)
      const normalizedPlayId = normalizePlayId(input.playId);
      const existing = yield* sql<{ id: number }>`
        SELECT id FROM generated_assets
        WHERE play_id = ${normalizedPlayId}
          AND asset_type = ${input.assetType}
          AND params_hash = ${paramsHash}
        LIMIT 1
      `.pipe(
        Effect.map((rows) => rows[0]),
        Effect.catchTag("SqlError", () => Effect.succeed(undefined)),
        Effect.mapError(
          (e) =>
            new AssetRepositoryError({
              message: `Failed to check existing asset: ${e}`,
              cause: e,
            })
        )
      );

      if (existing) {
        return {
          id: existing.id,
          paramsHash,
          wasExisting: true,
        };
      }

      // Insert new asset (use normalized play_id for SQLite UNIQUE constraint)
      const result = yield* sql`
        INSERT INTO generated_assets (
          play_id, asset_type, params_hash, generation_params,
          image_base64, mime_type, era, style, model_notes, prompt_used
        ) VALUES (
          ${normalizedPlayId},
          ${input.assetType},
          ${paramsHash},
          ${paramsJson},
          ${input.imageBase64},
          ${input.mimeType ?? "image/png"},
          ${input.era ?? null},
          ${input.style ?? null},
          ${input.modelNotes ?? null},
          ${input.promptUsed ?? null}
        )
        RETURNING id
      `.pipe(
        Effect.map((rows) => rows[0] as { id: number }),
        Effect.mapError(
          (e) =>
            new AssetRepositoryError({
              message: `Failed to insert asset: ${e}`,
              cause: e,
            })
        )
      );

      return {
        id: result.id,
        paramsHash,
        wasExisting: false,
      };
    });

  const getByPlay = (
    playId: number,
    assetType: AssetType
  ): Effect.Effect<Option.Option<GeneratedAssetRecord>, AssetRepositoryError> =>
    pipe(
      sql<GeneratedAssetRecord>`
        SELECT * FROM generated_assets
        WHERE play_id = ${playId}
          AND asset_type = ${assetType}
        ORDER BY created_at DESC
        LIMIT 1
      `,
      Effect.map((rows) => (rows.length > 0 ? Option.some(rows[0]) : Option.none())),
      Effect.mapError(
        (e) =>
          new AssetRepositoryError({
            message: `Failed to get asset: ${e}`,
            cause: e,
          })
      )
    );

  const getByParamsHash = (
    playId: number | undefined,
    assetType: AssetType,
    paramsHash: string
  ): Effect.Effect<Option.Option<GeneratedAssetRecord>, AssetRepositoryError> =>
    pipe(
      sql<GeneratedAssetRecord>`
        SELECT * FROM generated_assets
        WHERE play_id = ${normalizePlayId(playId)}
          AND asset_type = ${assetType}
          AND params_hash = ${paramsHash}
        LIMIT 1
      `,
      Effect.map((rows) => (rows.length > 0 ? Option.some(rows[0]) : Option.none())),
      Effect.mapError(
        (e) =>
          new AssetRepositoryError({
            message: `Failed to get asset by hash: ${e}`,
            cause: e,
          })
      )
    );

  const exists = (
    playId: number | undefined,
    assetType: AssetType,
    params: GenerationParams
  ): Effect.Effect<boolean, AssetRepositoryError> =>
    pipe(
      sql<{ cnt: number }>`
        SELECT COUNT(*) as cnt FROM generated_assets
        WHERE play_id = ${normalizePlayId(playId)}
          AND asset_type = ${assetType}
          AND params_hash = ${hashParams(params)}
      `,
      Effect.map((rows) => rows[0]?.cnt > 0),
      Effect.mapError(
        (e) =>
          new AssetRepositoryError({
            message: `Failed to check existence: ${e}`,
            cause: e,
          })
      )
    );

  const updateGcsUrl = (
    id: number,
    gcsUrl: string
  ): Effect.Effect<void, AssetRepositoryError> =>
    pipe(
      sql`
        UPDATE generated_assets
        SET gcs_url = ${gcsUrl},
            updated_at = datetime('now')
        WHERE id = ${id}
      `,
      Effect.asVoid,
      Effect.mapError(
        (e) =>
          new AssetRepositoryError({
            message: `Failed to update GCS URL: ${e}`,
            cause: e,
          })
      )
    );

  return {
    store,
    getByPlay,
    getByParamsHash,
    exists,
    updateGcsUrl,
  } satisfies GeneratedAssetRepositoryInterface;
});

/**
 * Live layer - requires SqlClient
 */
export const GeneratedAssetRepositoryLive: Layer.Layer<
  GeneratedAssetRepository,
  never,
  SqlClient.SqlClient
> = Layer.effect(GeneratedAssetRepository, makeGeneratedAssetRepository);
