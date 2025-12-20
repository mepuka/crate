import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiError, HttpApiGroup } from "@effect/platform"

import { Effect, Layer, Schema } from "effect"

import { FactPlay } from "../../knowledge_base/fact_plays/index.js"
import { FactPlaysService } from "../../knowledge_base/fact_plays/service.js"
import { GeneratedAsset, StoreAssetInput, StoreAssetResponse, GeneratedAssetsService } from "../../knowledge_base/generated_assets/index.js"

// Pagination schema for query parameters
export const PaginationParams = Schema.Struct(
  {
    limit: Schema.optional(Schema.NumberFromString.pipe(
      Schema.positive(),
      Schema.lessThanOrEqualTo(100),
      Schema.annotations({
        default: 50,
        description: "Maximum number of results to return (1-100)"
      })
    )),
    offset: Schema.optional(Schema.NumberFromString.pipe(
      Schema.nonNegative(),
      Schema.annotations({
        default: 0,
        description: "Number of results to skip"
      })
    ))
  }
)

// Play ID parameter for asset queries
const PlayIdParam = Schema.Struct({
  play_id: Schema.NumberFromString.pipe(
    Schema.positive(),
    Schema.annotations({ description: "Play ID to fetch assets for" })
  )
})

const Api = HttpApi.make("Crate").add(
  HttpApiGroup.make("Plays")
    .add(
      HttpApiEndpoint.get("getRecentPlays", "/recent")
        .setUrlParams(PaginationParams)
        .addSuccess(Schema.Array(FactPlay))
        .addError(HttpApiError.BadRequest)
        .addError(HttpApiError.InternalServerError)
    )
    .add(
      HttpApiEndpoint.get("getGeneratedAssets", "/generated-assets")
        .setUrlParams(PlayIdParam)
        .addSuccess(Schema.Array(GeneratedAsset))
        .addError(HttpApiError.BadRequest)
        .addError(HttpApiError.NotFound)
        .addError(HttpApiError.InternalServerError)
    )
    .add(
      HttpApiEndpoint.post("storeGeneratedAsset", "/generated-assets")
        .setPayload(StoreAssetInput)
        .addSuccess(StoreAssetResponse)
        .addError(HttpApiError.BadRequest)
        .addError(HttpApiError.InternalServerError)
    )
)

const PlaysLive = HttpApiBuilder.group(
  Api,
  "Plays",
  (handlers) =>
    handlers
      .handle("getRecentPlays", (
        { urlParams }: { urlParams: { readonly limit?: number | undefined; readonly offset?: number | undefined } }
      ) =>
        FactPlaysService.getRecentPlays(urlParams.limit, urlParams.offset).pipe(
          Effect.catchTags(
            {
              ParseError: () => Effect.fail(new HttpApiError.BadRequest()),
              SqlError: () => Effect.fail(new HttpApiError.InternalServerError())
            }
          )
        ))
      .handle("getGeneratedAssets", (
        { urlParams }: { urlParams: { readonly play_id: number } }
      ) =>
        GeneratedAssetsService.getByPlayId(urlParams.play_id).pipe(
          Effect.catchTags({
            GeneratedAssetsError: () => Effect.fail(new HttpApiError.InternalServerError()),
            ParseError: () => Effect.fail(new HttpApiError.BadRequest()),
            SqlError: () => Effect.fail(new HttpApiError.InternalServerError())
          })
        ))
      .handle("storeGeneratedAsset", (
        { payload }: { payload: typeof StoreAssetInput.Type }
      ) =>
        GeneratedAssetsService.storeAsset(payload).pipe(
          Effect.catchTags({
            GeneratedAssetsError: () => Effect.fail(new HttpApiError.InternalServerError()),
            ParseError: () => Effect.fail(new HttpApiError.BadRequest()),
            SqlError: () => Effect.fail(new HttpApiError.InternalServerError())
          })
        ))
).pipe(
  Layer.provide(FactPlaysService.Default),
  Layer.provide(GeneratedAssetsService.Default)
)

export const LayerAPI = HttpApiBuilder.api(Api).pipe(Layer.provide(PlaysLive))
