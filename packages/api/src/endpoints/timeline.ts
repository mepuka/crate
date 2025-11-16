import { HttpApiEndpoint, HttpApiGroup, HttpApiError } from "@effect/platform"
import { TimelineParams } from "../schemas/SearchParams.js"
import { TimelineResponse } from "@crate/domain/faiss/schemas"

/**
 * Timeline API Endpoints
 *
 * GET /api/plays/timeline - Get plays chronologically with flexible navigation
 */

export const TimelineApi = HttpApiGroup.make("timeline")
  .add(
    HttpApiEndpoint.get("getTimeline", "/timeline")
      .setUrlParams(TimelineParams)
      .addSuccess(TimelineResponse)
      .addError(HttpApiError.BadRequest)
      .addError(HttpApiError.InternalServerError)
  )
  .prefix("/api/plays")
