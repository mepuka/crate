/**
 * URL-synchronized timeline params using effect-atom
 *
 * This shows how to use the reusable TimelineParams schema
 * from @crate/api with Atom.searchParam() for URL synchronization.
 *
 * Pattern from effect-atom README:
 * https://github.com/tim-smart/effect-atom?tab=readme-ov-file#atomsearchparam
 *
 * USAGE IN COMPONENTS:
 *
 * ```typescript
 * import { useAtom } from "@effect-atom/atom-react"
 * import { limitAtom, cursorAtom } from "@/atoms/timeline-url-sync"
 * import { Option } from "effect"
 *
 * function TimelineComponent() {
 *   const [limit, setLimit] = useAtom(limitAtom)
 *   const [cursor, setCursor] = useAtom(cursorAtom)
 *
 *   // Reading values (atoms return Option<T>)
 *   const limitValue = Option.getOrElse(limit, () => 50)
 *   const cursorValue = Option.getOrUndefined(cursor)
 *
 *   // Setting values (automatically updates URL)
 *   setLimit(Option.some(100))
 *   setCursor(Option.some("eyJpZCI6MTIzfQ=="))
 * }
 * ```
 *
 * URL INTEGRATION:
 * - When atoms are set, URL is updated: ?limit=100&cursor=eyJpZCI6MTIzfQ==
 * - When URL changes (browser back/forward), atoms update automatically
 * - Works seamlessly with TanStack Router
 */

import { Atom } from "@effect-atom/atom-react";
import { Schema, Option } from "effect";
import type { TimelineParams } from "@crate/api";

/**
 * URL param atoms for timeline navigation.
 *
 * These atoms sync with URL search params and use the same schema types
 * as the HttpApiEndpoint.setUrlParams(TimelineParams) in @crate/api.
 *
 * This ensures consistency across:
 * 1. API request validation (HttpApiClient)
 * 2. URL state management (Atom.searchParam)
 * 3. Router search params (TanStack Router)
 *
 * Note: Atom.searchParam returns Option<A> values.
 * Use Option.getOrElse or Option.getOrUndefined when reading.
 */

// Limit param
export const limitAtom = Atom.searchParam("limit", {
  schema: Schema.NumberFromString,
});

// Cursor param
export const cursorAtom = Atom.searchParam("cursor", {
  schema: Schema.String,
});

// Since param for time-based jumps
export const sinceAtom = Atom.searchParam("since", {
  schema: Schema.String,
});

// Until param for time-based jumps
export const untilAtom = Atom.searchParam("until", {
  schema: Schema.String,
});

// Percentage param for percentage-based jumps
export const percentageAtom = Atom.searchParam("percentage", {
  schema: Schema.NumberFromString,
});

// Anchor ID param for anchor-based jumps
export const anchorIdAtom = Atom.searchParam("anchor_id", {
  schema: Schema.NumberFromString,
});

/**
 * Helper to remove undefined and empty string values from params.
 * The API expects params to be omitted entirely, not sent as empty strings.
 */
function cleanParams<T extends Record<string, any>>(params: T): Partial<T> {
  const cleaned: Partial<T> = {};
  for (const [key, value] of Object.entries(params)) {
    // Only include defined, non-empty values
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key as keyof T] = value;
    }
  }
  return cleaned;
}

/**
 * Computed atom that derives API call params from URL params.
 *
 * Usage:
 * ```typescript
 * const params = useAtom(timelineParamsAtom)
 * const client = yield* kexpApiClient
 * const data = yield* client.timeline.getTimeline({ urlParams: params })
 * ```
 */
export const timelineParamsAtom = Atom.make((get) => {
  const rawParams = {
    limit: Option.getOrElse(get(limitAtom), () => 50),
    cursor: Option.getOrUndefined(get(cursorAtom)),
    since: Option.getOrUndefined(get(sinceAtom)),
    until: Option.getOrUndefined(get(untilAtom)),
    percentage: Option.getOrUndefined(get(percentageAtom)),
    anchor_id: Option.getOrUndefined(get(anchorIdAtom)),
  };

  // Clean params: remove undefined and empty strings
  return cleanParams(rawParams) as TimelineParams;
});

/**
 * Example: Fetch timeline using URL-synchronized params
 *
 * This shows how to combine URL-synced atoms with the HttpApiClient.
 * The params are automatically derived from the URL, so the API call
 * always reflects the current URL state.
 */
/*
import { httpRuntime, kexpApiClient } from "@/lib/http-runtime"
import { Effect } from "effect"

export const fetchTimelineFromUrlAtom = httpRuntime.fn()(
  (_, get) => Effect.gen(function* () {
    // Get URL-synchronized params
    const params = get(timelineParamsAtom)

    // Make type-safe API call
    const client = yield* kexpApiClient
    const data = yield* client.timeline.getTimeline({ urlParams: params })

    return data
  })
)
*/
