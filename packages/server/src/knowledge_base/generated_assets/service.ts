import { SqlClient, SqlSchema } from "@effect/sql"
import { Data, Effect, Schema } from "effect"
import { MusicKBSqlLive } from "../../sql/Sql.js"
import { GeneratedAsset, GeneratedAssetRow, StoreAssetInput, StoreAssetResponse, transformRowToAsset } from "./schemas.js"

/**
 * Sentinel value for artist-level assets (no play_id).
 * SQLite NULL values don't work with UNIQUE constraints, so we use 0.
 */
const ARTIST_LEVEL_PLAY_ID = 0

/**
 * Normalize playId for storage: undefined becomes sentinel value
 */
const normalizePlayId = (playId: number | undefined): number =>
  playId ?? ARTIST_LEVEL_PLAY_ID

/**
 * Error for generated assets queries
 */
export class GeneratedAssetsError extends Data.TaggedError("GeneratedAssetsError")<{
  readonly cause: unknown
  readonly message: string
}> {}

/**
 * Service for querying generated visual assets
 */
export class GeneratedAssetsService extends Effect.Service<GeneratedAssetsService>()(
  "GeneratedAssetsService",
  {
    accessors: true,
    effect: Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      /**
       * Get all generated assets for a play
       */
      const getByPlayId = (playId: number) =>
        Effect.gen(function*() {
          const query = SqlSchema.findAll({
            Request: Schema.Struct({ play_id: Schema.Number }),
            Result: GeneratedAssetRow,
            execute: (params) =>
              sql`
                SELECT * FROM generated_assets
                WHERE play_id = ${params.play_id}
                ORDER BY created_at DESC
              `
          })

          const rows = yield* query({ play_id: playId })

          // Transform rows to API format, filtering out nulls
          return rows
            .map(transformRowToAsset)
            .filter((asset): asset is GeneratedAsset => asset !== null)
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new GeneratedAssetsError({
                cause: error,
                message: `Failed to fetch assets for play ${playId}: ${error}`
              })
            )
          )
        )

      /**
       * Get assets by type for a play
       */
      const getByPlayIdAndType = (playId: number, assetType: string) =>
        Effect.gen(function*() {
          const query = SqlSchema.findAll({
            Request: Schema.Struct({
              play_id: Schema.Number,
              asset_type: Schema.String
            }),
            Result: GeneratedAssetRow,
            execute: (params) =>
              sql`
                SELECT * FROM generated_assets
                WHERE play_id = ${params.play_id}
                  AND asset_type = ${params.asset_type}
                ORDER BY created_at DESC
              `
          })

          const rows = yield* query({ play_id: playId, asset_type: assetType })

          return rows
            .map(transformRowToAsset)
            .filter((asset): asset is GeneratedAsset => asset !== null)
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new GeneratedAssetsError({
                cause: error,
                message: `Failed to fetch ${assetType} assets for play ${playId}: ${error}`
              })
            )
          )
        )

      /**
       * Check if a play has any generated assets
       */
      const hasAssets = (playId: number) =>
        Effect.gen(function*() {
          const query = SqlSchema.findOne({
            Request: Schema.Struct({ play_id: Schema.Number }),
            Result: Schema.Struct({ count: Schema.Number }),
            execute: (params) =>
              sql`
                SELECT COUNT(*) as count FROM generated_assets
                WHERE play_id = ${params.play_id}
              `
          })

          const result = yield* query({ play_id: playId })
          return result.isSome() && result.value.count > 0
        }).pipe(
          Effect.catchAll(() => Effect.succeed(false))
        )

      /**
       * Get recent generated assets across all plays
       */
      const getRecent = (limit: number = 20) =>
        Effect.gen(function*() {
          const query = SqlSchema.findAll({
            Request: Schema.Struct({ limit: Schema.Number }),
            Result: GeneratedAssetRow,
            execute: (params) =>
              sql`
                SELECT * FROM generated_assets
                WHERE play_id IS NOT NULL
                ORDER BY created_at DESC
                LIMIT ${params.limit}
              `
          })

          const rows = yield* query({ limit })

          return rows
            .map(transformRowToAsset)
            .filter((asset): asset is GeneratedAsset => asset !== null)
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new GeneratedAssetsError({
                cause: error,
                message: `Failed to fetch recent assets: ${error}`
              })
            )
          )
        )

      /**
       * Store a new generated asset
       * Returns existing record if asset with same params_hash already exists
       */
      const storeAsset = (input: StoreAssetInput) =>
        Effect.gen(function*() {
          const normalizedPlayId = normalizePlayId(input.play_id)

          // Check if exists first (idempotent)
          const existingQuery = SqlSchema.findOne({
            Request: Schema.Struct({
              play_id: Schema.Number,
              asset_type: Schema.String,
              params_hash: Schema.String
            }),
            Result: Schema.Struct({ id: Schema.Number }),
            execute: (params) =>
              sql`
                SELECT id FROM generated_assets
                WHERE play_id = ${params.play_id}
                  AND asset_type = ${params.asset_type}
                  AND params_hash = ${params.params_hash}
                LIMIT 1
              `
          })

          const existing = yield* existingQuery({
            play_id: normalizedPlayId,
            asset_type: input.asset_type,
            params_hash: input.params_hash
          })

          if (existing.isSome()) {
            return {
              id: existing.value.id,
              params_hash: input.params_hash,
              was_existing: true
            } satisfies StoreAssetResponse
          }

          // Insert new asset
          const insertResult = yield* sql`
            INSERT INTO generated_assets (
              play_id, asset_type, params_hash, generation_params,
              image_base64, mime_type, era, style, model_notes, prompt_used, gcs_url
            ) VALUES (
              ${normalizedPlayId},
              ${input.asset_type},
              ${input.params_hash},
              ${input.generation_params ?? null},
              ${input.image_base64},
              ${input.mime_type ?? "image/png"},
              ${input.era ?? null},
              ${input.style ?? null},
              ${input.model_notes ?? null},
              ${input.prompt_used ?? null},
              ${input.gcs_url ?? null}
            )
            RETURNING id
          `.pipe(Effect.map((rows) => rows[0] as { id: number }))

          return {
            id: insertResult.id,
            params_hash: input.params_hash,
            was_existing: false
          } satisfies StoreAssetResponse
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new GeneratedAssetsError({
                cause: error,
                message: `Failed to store asset: ${error}`
              })
            )
          )
        )

      return {
        getByPlayId,
        getByPlayIdAndType,
        hasAssets,
        getRecent,
        storeAsset
      }
    }),
    dependencies: [MusicKBSqlLive]
  }
) {}
