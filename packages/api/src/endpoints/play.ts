import { HttpApiEndpoint, HttpApiGroup, HttpApiError } from "@effect/platform"
import { PlayResult } from "../schemas/Play.js"
import { Schema } from "effect"

/**
 * Play API Endpoints
 *
 * GET /api/plays/:id - Get single play by ID
 */

export const PlayApi = HttpApiGroup.make("play")
  .add(
    HttpApiEndpoint.get("getById", "/:id")
      .setPath(
        Schema.Struct({
          id: Schema.NumberFromString
        })
      )
      .addSuccess(PlayResult)
      .addError(HttpApiError.NotFound)
      .addError(HttpApiError.InternalServerError)
  )
  .prefix("/api/plays")
