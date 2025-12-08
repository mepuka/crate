/**
 * MbidResolverService
 *
 * Resolves entity names to MusicBrainz IDs (MBIDs) via the MusicBrainz API.
 * Provides search and lookup operations with rate limiting.
 *
 * @module
 */

import { Context, Effect, Layer, Schema, Ref, Duration } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { MusicBrainzConfig } from "../config.js";
import { MbidResolveError } from "./errors.js";
import type {
  MbEntityType,
  MbEntityResult,
  ResolveMbidParams,
  ResolveMbidResponse,
} from "../tools/schemas.js";

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Details returned from MBID lookup
 */
export interface MbEntityDetails {
  readonly mbid: string;
  readonly name: string;
  readonly type: MbEntityType;
  readonly disambiguation: string | undefined;
  readonly country: string | undefined;
  readonly area: string | undefined;
  readonly sortName: string | undefined;
  readonly beginDate: string | undefined;
  readonly endDate: string | undefined;
  readonly artistCredit: string | undefined;
  readonly firstReleaseDate: string | undefined;
}

/**
 * MbidResolverService interface
 */
export interface MbidResolverServiceInterface {
  /**
   * Search MusicBrainz for entities matching a query
   *
   * @param params - Search parameters including query, entity type, and optional hints
   * @returns Array of matching entities with scores
   */
  readonly resolve: (
    params: ResolveMbidParams
  ) => Effect.Effect<ResolveMbidResponse, MbidResolveError>;

  /**
   * Look up a specific entity by MBID
   *
   * @param mbid - The MusicBrainz ID to look up
   * @param entityType - The type of entity (artist, recording, release, etc.)
   * @returns Entity details
   */
  readonly lookup: (
    mbid: string,
    entityType: MbEntityType
  ) => Effect.Effect<MbEntityDetails, MbidResolveError>;
}

// =============================================================================
// Service Tag
// =============================================================================

/**
 * MbidResolverService - resolve names to MusicBrainz IDs
 */
export class MbidResolverService extends Context.Tag("MbidResolverService")<
  MbidResolverService,
  MbidResolverServiceInterface
>() {}

// =============================================================================
// MusicBrainz API Response Schemas
// =============================================================================

/**
 * Artist search result from MusicBrainz
 */
const MbArtistSearchResult = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  disambiguation: Schema.optional(Schema.String),
  score: Schema.Number,
  country: Schema.optional(Schema.String),
  "sort-name": Schema.optional(Schema.String),
  "life-span": Schema.optional(
    Schema.Struct({
      begin: Schema.optional(Schema.String),
      end: Schema.optional(Schema.String),
    })
  ),
});

/**
 * Recording search result from MusicBrainz
 */
const MbRecordingSearchResult = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  disambiguation: Schema.optional(Schema.String),
  score: Schema.Number,
  "artist-credit": Schema.optional(
    Schema.Array(
      Schema.Struct({
        artist: Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      })
    )
  ),
  "first-release-date": Schema.optional(Schema.String),
});

/**
 * Release search result from MusicBrainz
 */
const MbReleaseSearchResult = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  disambiguation: Schema.optional(Schema.String),
  score: Schema.Number,
  country: Schema.optional(Schema.String),
  date: Schema.optional(Schema.String),
  "artist-credit": Schema.optional(
    Schema.Array(
      Schema.Struct({
        artist: Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      })
    )
  ),
});

/**
 * Release group search result from MusicBrainz
 */
const MbReleaseGroupSearchResult = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  disambiguation: Schema.optional(Schema.String),
  score: Schema.Number,
  "primary-type": Schema.optional(Schema.String),
  "first-release-date": Schema.optional(Schema.String),
  "artist-credit": Schema.optional(
    Schema.Array(
      Schema.Struct({
        artist: Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      })
    )
  ),
});

/**
 * Label search result from MusicBrainz
 */
const MbLabelSearchResult = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  disambiguation: Schema.optional(Schema.String),
  score: Schema.Number,
  country: Schema.optional(Schema.String),
  "label-code": Schema.optional(Schema.Number),
});

/**
 * Place search result from MusicBrainz (venues, studios, etc.)
 */
const MbPlaceSearchResult = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  disambiguation: Schema.optional(Schema.String),
  score: Schema.Number,
  type: Schema.optional(Schema.String),
  address: Schema.optional(Schema.String),
  area: Schema.optional(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
    })
  ),
  coordinates: Schema.optional(
    Schema.Struct({
      latitude: Schema.Number,
      longitude: Schema.Number,
    })
  ),
  "life-span": Schema.optional(
    Schema.Struct({
      begin: Schema.optional(Schema.String),
      end: Schema.optional(Schema.String),
    })
  ),
});

/**
 * Artist search response
 */
const MbArtistSearchResponse = Schema.Struct({
  artists: Schema.Array(MbArtistSearchResult),
});

/**
 * Recording search response
 */
const MbRecordingSearchResponse = Schema.Struct({
  recordings: Schema.Array(MbRecordingSearchResult),
});

/**
 * Release search response
 */
const MbReleaseSearchResponse = Schema.Struct({
  releases: Schema.Array(MbReleaseSearchResult),
});

/**
 * Release group search response
 */
const MbReleaseGroupSearchResponse = Schema.Struct({
  "release-groups": Schema.Array(MbReleaseGroupSearchResult),
});

/**
 * Label search response
 */
const MbLabelSearchResponse = Schema.Struct({
  labels: Schema.Array(MbLabelSearchResult),
});

/**
 * Place search response
 */
const MbPlaceSearchResponse = Schema.Struct({
  places: Schema.Array(MbPlaceSearchResult),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build artist credit string from artist-credit array
 */
const buildArtistCredit = (
  artistCredit: ReadonlyArray<{ artist: { name: string } }> | undefined
): string | undefined => {
  if (!artistCredit || artistCredit.length === 0) return undefined;
  return artistCredit.map((ac) => ac.artist.name).join(", ");
};

/**
 * Build search query with optional artist hint
 */
const buildSearchQuery = (
  query: string,
  entityType: MbEntityType,
  artistHint?: string
): string => {
  // URL encode the query
  const encodedQuery = encodeURIComponent(query);

  // For recordings/releases, add artist hint if provided
  if (
    artistHint &&
    (entityType === "recording" ||
      entityType === "release" ||
      entityType === "release_group")
  ) {
    const encodedArtist = encodeURIComponent(artistHint);
    return `${encodedQuery} AND artist:${encodedArtist}`;
  }

  return encodedQuery;
};

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Create the MbidResolverService implementation
 */
const makeMbidResolverService = Effect.gen(function* () {
  const config = yield* MusicBrainzConfig;

  // Track last request time for rate limiting
  const lastRequestTime = yield* Ref.make(0);

  // Configure HTTP client with base URL and required headers
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(config.baseUrl)),
    HttpClient.mapRequest(HttpClientRequest.acceptJson),
    HttpClient.mapRequest(
      HttpClientRequest.setHeader("User-Agent", config.userAgent)
    )
  );

  /**
   * Apply rate limiting - wait if needed to respect MusicBrainz rate limits
   */
  const applyRateLimit = Effect.gen(function* () {
    const now = Date.now();
    const last = yield* Ref.get(lastRequestTime);
    const elapsed = now - last;
    const delayMs = Duration.toMillis(config.rateLimitDelay);

    if (elapsed < delayMs && last > 0) {
      const waitMs = delayMs - elapsed;
      yield* Effect.sleep(Duration.millis(waitMs));
    }

    yield* Ref.set(lastRequestTime, Date.now());
  });

  /**
   * Parse artist search results into MbEntityResult array
   */
  const parseArtistResults = (
    response: typeof MbArtistSearchResponse.Type
  ): ReadonlyArray<MbEntityResult> =>
    response.artists.map((artist) => ({
      mbid: artist.id,
      name: artist.name,
      type: "artist" as const,
      disambiguation: artist.disambiguation,
      score: artist.score,
      country: artist.country,
    }));

  /**
   * Parse recording search results into MbEntityResult array
   */
  const parseRecordingResults = (
    response: typeof MbRecordingSearchResponse.Type
  ): ReadonlyArray<MbEntityResult> =>
    response.recordings.map((recording) => ({
      mbid: recording.id,
      name: recording.title,
      type: "recording" as const,
      disambiguation: recording.disambiguation,
      score: recording.score,
      artist_credit: buildArtistCredit(recording["artist-credit"]),
      release_date: recording["first-release-date"],
    }));

  /**
   * Parse release search results into MbEntityResult array
   */
  const parseReleaseResults = (
    response: typeof MbReleaseSearchResponse.Type
  ): ReadonlyArray<MbEntityResult> =>
    response.releases.map((release) => ({
      mbid: release.id,
      name: release.title,
      type: "release" as const,
      disambiguation: release.disambiguation,
      score: release.score,
      artist_credit: buildArtistCredit(release["artist-credit"]),
      release_date: release.date,
      country: release.country,
    }));

  /**
   * Parse release group search results into MbEntityResult array
   */
  const parseReleaseGroupResults = (
    response: typeof MbReleaseGroupSearchResponse.Type
  ): ReadonlyArray<MbEntityResult> =>
    response["release-groups"].map((rg) => ({
      mbid: rg.id,
      name: rg.title,
      type: "release_group" as const,
      disambiguation: rg.disambiguation,
      score: rg.score,
      artist_credit: buildArtistCredit(rg["artist-credit"]),
      release_date: rg["first-release-date"],
    }));

  /**
   * Parse label search results into MbEntityResult array
   */
  const parseLabelResults = (
    response: typeof MbLabelSearchResponse.Type
  ): ReadonlyArray<MbEntityResult> =>
    response.labels.map((label) => ({
      mbid: label.id,
      name: label.name,
      type: "label" as const,
      disambiguation: label.disambiguation,
      score: label.score,
      country: label.country,
    }));

  /**
   * Parse place search results into MbEntityResult array
   */
  const parsePlaceResults = (
    response: typeof MbPlaceSearchResponse.Type
  ): ReadonlyArray<MbEntityResult> =>
    response.places.map((place) => ({
      mbid: place.id,
      name: place.name,
      type: "place" as const,
      disambiguation: place.disambiguation ?? place.type,
      score: place.score,
      country: place.area?.name,
    }));

  /**
   * Search for entities matching a query
   */
  const resolve = (
    params: ResolveMbidParams
  ): Effect.Effect<ResolveMbidResponse, MbidResolveError> =>
    Effect.gen(function* () {
      yield* applyRateLimit;

      const searchQuery = buildSearchQuery(
        params.query,
        params.entity_type,
        params.artist_hint
      );

      // Build endpoint based on entity type
      const endpoint = `/${params.entity_type}/?query=${searchQuery}&fmt=json&limit=10`;

      const response = yield* client.get(endpoint).pipe(
        Effect.timeout(Duration.seconds(30)),
        Effect.mapError(
          (error) =>
            new MbidResolveError({
              message: `MusicBrainz search failed: ${error}`,
              entityType: params.entity_type,
              query: params.query,
              cause: error,
            })
        )
      );

      // Parse response based on entity type
      const results = yield* Effect.gen(function* () {
        switch (params.entity_type) {
          case "artist": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              MbArtistSearchResponse
            )(response);
            return parseArtistResults(data);
          }
          case "recording": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              MbRecordingSearchResponse
            )(response);
            return parseRecordingResults(data);
          }
          case "release": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              MbReleaseSearchResponse
            )(response);
            return parseReleaseResults(data);
          }
          case "release_group": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              MbReleaseGroupSearchResponse
            )(response);
            return parseReleaseGroupResults(data);
          }
          case "label": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              MbLabelSearchResponse
            )(response);
            return parseLabelResults(data);
          }
          case "place": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              MbPlaceSearchResponse
            )(response);
            return parsePlaceResults(data);
          }
        }
      }).pipe(
        Effect.mapError(
          (error) =>
            new MbidResolveError({
              message: `Failed to parse MusicBrainz response: ${error}`,
              entityType: params.entity_type,
              query: params.query,
              cause: error,
            })
        )
      );

      return {
        results: results as MbEntityResult[],
        query: params.query,
        entity_type: params.entity_type,
      };
    });

  /**
   * Look up a specific entity by MBID
   */
  const lookup = (
    mbid: string,
    entityType: MbEntityType
  ): Effect.Effect<MbEntityDetails, MbidResolveError> =>
    Effect.gen(function* () {
      yield* applyRateLimit;

      const endpoint = `/${entityType}/${mbid}?fmt=json`;

      const response = yield* client.get(endpoint).pipe(
        Effect.timeout(Duration.seconds(30)),
        Effect.mapError(
          (error) =>
            new MbidResolveError({
              message: `MusicBrainz lookup failed: ${error}`,
              entityType: entityType,
              mbid,
              cause: error,
            })
        )
      );

      // Parse response based on entity type
      // Note: MusicBrainz API returns null for missing optional fields, so we use NullishOr
      const NullishString = Schema.NullishOr(Schema.String);

      const details = yield* Effect.gen(function* () {
        switch (entityType) {
          case "artist": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              Schema.Struct({
                id: Schema.String,
                name: Schema.String,
                disambiguation: NullishString,
                country: NullishString,
                "sort-name": NullishString,
                "life-span": Schema.optional(
                  Schema.Struct({
                    begin: NullishString,
                    end: NullishString,
                    ended: Schema.optional(Schema.Boolean),
                  })
                ),
              })
            )(response);
            return {
              mbid: data.id,
              name: data.name,
              type: "artist" as const,
              disambiguation: data.disambiguation ?? undefined,
              country: data.country ?? undefined,
              area: undefined,
              sortName: data["sort-name"] ?? undefined,
              beginDate: data["life-span"]?.begin ?? undefined,
              endDate: data["life-span"]?.end ?? undefined,
              artistCredit: undefined,
              firstReleaseDate: undefined,
            } satisfies MbEntityDetails;
          }
          case "recording": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              Schema.Struct({
                id: Schema.String,
                title: Schema.String,
                disambiguation: NullishString,
                "first-release-date": NullishString,
                "artist-credit": Schema.optional(
                  Schema.Array(
                    Schema.Struct({
                      artist: Schema.Struct({
                        id: Schema.String,
                        name: Schema.String,
                      }),
                    })
                  )
                ),
              })
            )(response);
            return {
              mbid: data.id,
              name: data.title,
              type: "recording" as const,
              disambiguation: data.disambiguation ?? undefined,
              country: undefined,
              area: undefined,
              sortName: undefined,
              beginDate: undefined,
              endDate: undefined,
              artistCredit: buildArtistCredit(data["artist-credit"]),
              firstReleaseDate: data["first-release-date"] ?? undefined,
            } satisfies MbEntityDetails;
          }
          case "release": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              Schema.Struct({
                id: Schema.String,
                title: Schema.String,
                disambiguation: NullishString,
                country: NullishString,
                date: NullishString,
                "artist-credit": Schema.optional(
                  Schema.Array(
                    Schema.Struct({
                      artist: Schema.Struct({
                        id: Schema.String,
                        name: Schema.String,
                      }),
                    })
                  )
                ),
              })
            )(response);
            return {
              mbid: data.id,
              name: data.title,
              type: "release" as const,
              disambiguation: data.disambiguation ?? undefined,
              country: data.country ?? undefined,
              area: undefined,
              sortName: undefined,
              beginDate: undefined,
              endDate: undefined,
              artistCredit: buildArtistCredit(data["artist-credit"]),
              firstReleaseDate: data.date ?? undefined,
            } satisfies MbEntityDetails;
          }
          case "release_group": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              Schema.Struct({
                id: Schema.String,
                title: Schema.String,
                disambiguation: NullishString,
                "first-release-date": NullishString,
                "artist-credit": Schema.optional(
                  Schema.Array(
                    Schema.Struct({
                      artist: Schema.Struct({
                        id: Schema.String,
                        name: Schema.String,
                      }),
                    })
                  )
                ),
              })
            )(response);
            return {
              mbid: data.id,
              name: data.title,
              type: "release_group" as const,
              disambiguation: data.disambiguation ?? undefined,
              country: undefined,
              area: undefined,
              sortName: undefined,
              beginDate: undefined,
              endDate: undefined,
              artistCredit: buildArtistCredit(data["artist-credit"]),
              firstReleaseDate: data["first-release-date"] ?? undefined,
            } satisfies MbEntityDetails;
          }
          case "label": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              Schema.Struct({
                id: Schema.String,
                name: Schema.String,
                disambiguation: NullishString,
                country: NullishString,
              })
            )(response);
            return {
              mbid: data.id,
              name: data.name,
              type: "label" as const,
              disambiguation: data.disambiguation ?? undefined,
              country: data.country ?? undefined,
              area: undefined,
              sortName: undefined,
              beginDate: undefined,
              endDate: undefined,
              artistCredit: undefined,
              firstReleaseDate: undefined,
            } satisfies MbEntityDetails;
          }
          case "place": {
            const data = yield* HttpClientResponse.schemaBodyJson(
              Schema.Struct({
                id: Schema.String,
                name: Schema.String,
                disambiguation: NullishString,
                type: NullishString,
                address: NullishString,
                area: Schema.optional(
                  Schema.Struct({
                    id: Schema.String,
                    name: Schema.String,
                  })
                ),
                "life-span": Schema.optional(
                  Schema.Struct({
                    begin: NullishString,
                    end: NullishString,
                  })
                ),
              })
            )(response);
            return {
              mbid: data.id,
              name: data.name,
              type: "place" as const,
              disambiguation: data.disambiguation ?? data.type ?? undefined,
              country: undefined,
              area: data.area?.name ?? data.address ?? undefined,
              sortName: undefined,
              beginDate: data["life-span"]?.begin ?? undefined,
              endDate: data["life-span"]?.end ?? undefined,
              artistCredit: undefined,
              firstReleaseDate: undefined,
            } satisfies MbEntityDetails;
          }
        }
      }).pipe(
        Effect.mapError(
          (error) =>
            new MbidResolveError({
              message: `Failed to parse MusicBrainz lookup response: ${error}`,
              entityType: entityType,
              mbid,
              cause: error,
            })
        )
      );

      return details;
    });

  return {
    resolve,
    lookup,
  } satisfies MbidResolverServiceInterface;
});

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for MbidResolverService
 * Requires MusicBrainzConfig and HttpClient
 */
export const MbidResolverServiceLive: Layer.Layer<
  MbidResolverService,
  never,
  MusicBrainzConfig | HttpClient.HttpClient
> = Layer.effect(MbidResolverService, makeMbidResolverService);

/**
 * Fully composed layer with all dependencies
 * Note: May fail with ConfigError if required environment variables are missing
 */
export const MbidResolverServiceFull = MbidResolverServiceLive.pipe(
  Layer.provide(MusicBrainzConfig.Default),
  Layer.provide(FetchHttpClient.layer)
);

/**
 * Test layer with mock implementation
 */
export const MbidResolverServiceTest: Layer.Layer<MbidResolverService> =
  Layer.succeed(MbidResolverService, {
    resolve: (params) =>
      Effect.succeed({
        results: [
          {
            mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
            name: params.query,
            type: params.entity_type,
            score: 100,
            disambiguation: "Mock result",
          },
        ],
        query: params.query,
        entity_type: params.entity_type,
      }),
    lookup: (mbid, entityType) =>
      Effect.succeed({
        mbid,
        name: "Mock Entity",
        type: entityType,
        disambiguation: "Mock lookup result",
        country: undefined,
        area: undefined,
        sortName: undefined,
        beginDate: undefined,
        endDate: undefined,
        artistCredit: undefined,
        firstReleaseDate: undefined,
      } satisfies MbEntityDetails),
  } satisfies MbidResolverServiceInterface);

/**
 * Create a test layer with custom mock data
 */
export const makeMbidResolverServiceTestWithData = (
  searchResults: Record<string, ReadonlyArray<MbEntityResult>>,
  lookupResults: Record<string, MbEntityDetails>
): Layer.Layer<MbidResolverService> =>
  Layer.succeed(MbidResolverService, {
    resolve: (params) =>
      Effect.succeed({
        results: (searchResults[params.query] ?? []) as MbEntityResult[],
        query: params.query,
        entity_type: params.entity_type,
      }),
    lookup: (mbid, entityType) => {
      const result = lookupResults[mbid];
      if (result) {
        return Effect.succeed(result);
      }
      return Effect.fail(
        new MbidResolveError({
          message: `MBID not found: ${mbid}`,
          mbid,
          entityType: entityType,
        })
      );
    },
  } satisfies MbidResolverServiceInterface);
