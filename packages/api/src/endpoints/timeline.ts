import { HttpApiEndpoint, HttpApiGroup, HttpApiError } from "@effect/platform"
import { TimelineParams, PlayCountParams } from "../schemas/SearchParams.js"
import { TimelineResponse, PlayCountResponse } from "@crate/domain/faiss/schemas"

/**
 * Timeline API Endpoints
 *
 * GET /api/plays/timeline - Get plays chronologically with flexible navigation
 * GET /api/plays/count - Get play count by MBID filter
 */

export const TimelineApi = HttpApiGroup.make("timeline")
  .add(
    HttpApiEndpoint.get("getTimeline", "/timeline")
      .setUrlParams(TimelineParams)
      .addSuccess(TimelineResponse)
      .addError(HttpApiError.BadRequest)
      .addError(HttpApiError.InternalServerError)
  )
  .add(
    HttpApiEndpoint.get("getPlayCount", "/count")
      .setUrlParams(PlayCountParams)
      .addSuccess(PlayCountResponse)
      .addError(HttpApiError.BadRequest)
      .addError(HttpApiError.InternalServerError)
  )
  .prefix("/api/plays")
