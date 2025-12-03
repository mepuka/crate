/**
 * HTTP Client Utilities
 *
 * Shared HTTP client configuration for services.
 * Reduces duplication across FAISS, MusicBrainz, and Jina services.
 *
 * @module
 */

import { Effect } from "effect"
import { HttpClient, HttpClientRequest } from "@effect/platform"

/**
 * Configure a base HTTP client with URL prefix and JSON accept header
 */
export const makeJsonClient = (baseUrl: string) =>
  Effect.map(
    HttpClient.HttpClient,
    (client) => client.pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl)),
      HttpClient.mapRequest(HttpClientRequest.acceptJson)
    )
  )

/**
 * Configure HTTP client with additional headers
 */
export const makeJsonClientWithHeaders = (
  baseUrl: string,
  headers: Record<string, string>
) =>
  Effect.map(
    HttpClient.HttpClient,
    (client) => client.pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl)),
      HttpClient.mapRequest(HttpClientRequest.acceptJson),
      HttpClient.mapRequest((req) =>
        Object.entries(headers).reduce(
          (r, [k, v]) => HttpClientRequest.setHeader(k, v)(r),
          req
        )
      )
    )
  )

/**
 * Build URL params from an object, filtering out undefined values
 * and mapping camelCase keys to snake_case
 */
export const buildUrlParams = <T extends object>(
  params: T,
  keyMap?: Partial<Record<keyof T, string>>
): Record<string, string | number> =>
  Object.entries(params).reduce<Record<string, string | number>>(
    (acc, [key, value]) => {
      if (value !== undefined) {
        const paramName = keyMap?.[key as keyof T] ?? key
        acc[paramName] = value as string | number
      }
      return acc
    },
    {}
  )

/**
 * Compact an object by removing undefined values
 */
export const compactObject = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>

// =============================================================================
// Play Result Transformation
// =============================================================================

/**
 * Domain play result from FAISS API (uses Date objects)
 */
interface DomainPlayResult {
  readonly id: number
  readonly artist: string
  readonly song: string
  readonly similarity?: number | null
  readonly album: string | null
  readonly airdate: Date | string
  readonly release_date: Date | string | null
  readonly labels: readonly string[]
  readonly rotation_status: string | null
  readonly is_local: boolean
  readonly is_live: boolean
  readonly is_request: boolean
  readonly comment: string | null
  readonly show: number
  readonly image_uri: string | null
  readonly thumbnail_uri: string | null
  readonly artist_mbid: readonly string[]
  readonly recording_mbid: string | null
  readonly release_mbid: string | null
  readonly release_group_mbid: string | null
}

/**
 * Tool schema play result (uses ISO strings)
 */
export interface ToolPlayResult {
  readonly id: number
  readonly artist: string
  readonly song: string
  readonly similarity: number
  readonly album: string | null
  readonly airdate: string
  readonly release_date: string | null
  readonly labels: string[]
  readonly rotation_status: string | null
  readonly is_local: boolean
  readonly is_live: boolean
  readonly is_request: boolean
  readonly comment: string | null
  readonly show: number
  readonly image_uri: string | null
  readonly thumbnail_uri: string | null
  readonly artist_mbid: string[]
  readonly recording_mbid: string | null
  readonly release_mbid: string | null
  readonly release_group_mbid: string | null
}

/**
 * Convert Date or string to ISO string
 */
const toIsoString = (date: Date | string): string =>
  date instanceof Date ? date.toISOString() : String(date)

/**
 * Convert Date | string | null to string | null
 */
const toIsoStringOrNull = (date: Date | string | null): string | null =>
  date instanceof Date ? date.toISOString() : date

/**
 * Transform domain play result to tool schema format
 *
 * Handles:
 * - Date -> ISO string conversion for airdate/release_date
 * - readonly arrays -> mutable arrays for schema compliance
 * - Default similarity score (1.0 for timeline results)
 */
export const transformPlayResult = (
  play: DomainPlayResult,
  defaultSimilarity = 1.0
): ToolPlayResult => ({
  id: play.id,
  artist: play.artist,
  song: play.song,
  similarity: play.similarity ?? defaultSimilarity,
  album: play.album,
  airdate: toIsoString(play.airdate),
  release_date: toIsoStringOrNull(play.release_date),
  labels: [...play.labels],
  rotation_status: play.rotation_status,
  is_local: play.is_local,
  is_live: play.is_live,
  is_request: play.is_request,
  comment: play.comment,
  show: play.show,
  image_uri: play.image_uri,
  thumbnail_uri: play.thumbnail_uri,
  artist_mbid: [...play.artist_mbid],
  recording_mbid: play.recording_mbid,
  release_mbid: play.release_mbid,
  release_group_mbid: play.release_group_mbid
})
