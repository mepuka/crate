import { HttpApi } from "@effect/platform"
import { HealthApi } from "./endpoints/health.js"
import { SearchApi } from "./endpoints/search.js"
import { TimelineApi } from "./endpoints/timeline.js"
import { PlayApi } from "./endpoints/play.js"

/**
 * KEXP Radio Crate API
 *
 * Complete API definition for the KEXP backend.
 * Provides type-safe HTTP client generation via HttpApiClient.
 *
 * Usage:
 * ```typescript
 * import { KexpApi } from "@crate/api"
 * import { HttpApiClient } from "@effect/platform"
 *
 * const client = HttpApiClient.make(KexpApi)
 *
 * // Type-safe API calls
 * const timeline = yield* client.timeline.getTimeline({
 *   urlParams: { limit: 50, cursor: "..." }
 * })
 * ```
 */
export const KexpApi = HttpApi.make("kexp-api")
  .add(HealthApi)
  .add(SearchApi)
  .add(TimelineApi)
  .add(PlayApi)
