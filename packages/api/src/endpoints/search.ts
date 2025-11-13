import { HttpApiEndpoint, HttpApiGroup, HttpApiError } from "@effect/platform"
import { SearchParams } from "../schemas/SearchParams.js"
import { SearchResponse } from "../schemas/Play.js"

/**
 * Search API Endpoints
 *
 * POST /api/search - Semantic search over plays
 */

export const SearchApi = HttpApiGroup.make("search")
  .add(
    HttpApiEndpoint.post("search", "/search")
      .setPayload(SearchParams)
      .addSuccess(SearchResponse)
      .addError(HttpApiError.BadRequest)
      .addError(HttpApiError.InternalServerError)
  )
  .prefix("/api")
