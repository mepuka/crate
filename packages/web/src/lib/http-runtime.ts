import { Atom } from "@effect-atom/atom-react"
import { FetchHttpClient, HttpClient, HttpApiClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import { BrowserKeyValueStore } from "@effect/platform-browser"
import { Reactivity } from "@effect/experimental"
import { Effect, Layer } from "effect"
import { KexpApi } from "@crate/api"

// Get base URL from Vite environment variable
const getBaseUrl = (): string => {
  const meta = import.meta as { env?: { VITE_API_BASE_URL?: string } }
  return meta.env?.VITE_API_BASE_URL || "http://localhost:8000"
}

// Base HTTP client layer (browser fetch)
const baseHttpLayer = FetchHttpClient.layer

// Layer that replaces HttpClient with a configured version
const configuredHttpLayer = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return HttpClient.mapRequest(
      client,
      HttpClientRequest.prependUrl(getBaseUrl())
    )
  })
).pipe(Layer.provide(baseHttpLayer))

// Combined runtime with configured HTTP client and Reactivity support
export const httpRuntime = Atom.runtime(
  configuredHttpLayer.pipe(
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(BrowserKeyValueStore.layerLocalStorage)
  )
)

/**
 * Type-safe KEXP API client.
 *
 * Provides compile-time type safety for all API calls.
 * Automatically handles schema validation.
 *
 * Usage in atoms:
 * ```typescript
 * export const fetchTimelineAtom = httpRuntime.fn()(
 *   () => Effect.gen(function* () {
 *     const client = yield* kexpApiClient
 *     const timeline = yield* client.timeline.getTimeline({
 *       urlParams: { limit: 50 }
 *     })
 *     return timeline
 *   })
 * )
 * ```
 */
export const kexpApiClient = HttpApiClient.make(KexpApi)

// localStorage runtime for persisting state
