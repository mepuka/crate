import { HttpApiEndpoint, HttpApiGroup, HttpApiError } from "@effect/platform"
import {
  StreamingLinksRequest,
  StreamingLinksResponse
} from "@crate/domain/links/streaming"

/**
 * Streaming Links API
 *
 * GET /api/streaming-links - Resolve Spotify/Apple Music links from MBIDs
 */
export const StreamingLinksApi = HttpApiGroup.make("streamingLinks").add(
  HttpApiEndpoint.get("getStreamingLinks", "/streaming-links")
    .setUrlParams(StreamingLinksRequest)
    .addSuccess(StreamingLinksResponse)
    .addError(HttpApiError.BadRequest)
    .addError(HttpApiError.NotFound)
    .addError(HttpApiError.InternalServerError)
).prefix("/api")
