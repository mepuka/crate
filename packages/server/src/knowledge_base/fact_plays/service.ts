import { SqlClient, SqlSchema } from "@effect/sql"
import {
  Array,
  Chunk,
  Data,
  DateTime,
  Duration,
  Effect,
  Equal,
  Layer,
  Option,
  Request,
  RequestResolver,
  Schema,
  Stream
} from "effect"
import { KEXP_API_URL, KEXPApi } from "../../kexp/api.js"
import * as KEXPSchemas from "../../kexp/schemas.js"
import { MusicKBSqlLive } from "../../sql/Sql.js"
import type { DateRange, Pagination } from "./schemas.js"
import { FactPlay, factPlayFromKexpPlay, PlayId, ShowId } from "./schemas.js"

// Query schema for play by ID
export const PlayByIdQuerySchema = Schema.TemplateLiteralParser("play:", PlayId)
export type PlayByIdQuery = Schema.Schema.Encoded<typeof PlayByIdQuerySchema>

// Query schema for plays by artist
export const PlaysByArtistQuerySchema = Schema.TemplateLiteralParser(
  "artist:",
  Schema.String,
  " limit:",
  Schema.NumberFromString.pipe(Schema.positive()),
  " offset:",
  Schema.NumberFromString.pipe(Schema.nonNegative())
)
export type PlaysByArtistQuery = Schema.Schema.Encoded<typeof PlaysByArtistQuerySchema>

// Query schema for plays by date range
export const PlaysByDateRangeQuerySchema = Schema.TemplateLiteralParser(
  "from:",
  Schema.String,
  " to:",
  Schema.String,
  " limit:",
  Schema.NumberFromString.pipe(Schema.positive()),
  " offset:",
  Schema.NumberFromString.pipe(Schema.nonNegative())
)
export type PlaysByDateRangeQuery = Schema.Schema.Encoded<typeof PlaysByDateRangeQuerySchema>

// Query schema for plays by show
export const PlaysByShowQuerySchema = Schema.TemplateLiteralParser(
  "show:",
  ShowId,
  " limit:",
  Schema.NumberFromString.pipe(Schema.positive()),
  " offset:",
  Schema.NumberFromString.pipe(Schema.nonNegative())
)
export type PlaysByShowQuery = Schema.Schema.Encoded<typeof PlaysByShowQuerySchema>

// Query schema for plays by rotation status
export const PlaysByRotationStatusQuerySchema = Schema.TemplateLiteralParser(
  "rotation:",
  Schema.String,
  " limit:",
  Schema.NumberFromString.pipe(Schema.positive()),
  " offset:",
  Schema.NumberFromString.pipe(Schema.nonNegative())
)
export type PlaysByRotationStatusQuery = Schema.Schema.Encoded<typeof PlaysByRotationStatusQuerySchema>

// Query schema for local plays
export const LocalPlaysQuerySchema = Schema.TemplateLiteralParser(
  "local:",
  Schema.Literal("true", "false"),
  " limit:",
  Schema.NumberFromString.pipe(Schema.positive()),
  " offset:",
  Schema.NumberFromString.pipe(Schema.nonNegative())
)
export type LocalPlaysQuery = Schema.Schema.Encoded<typeof LocalPlaysQuerySchema>

export const InsertPlaysQuerySchema = Schema.ArrayEnsure(FactPlay.insert)
export type InsertPlaysQuery = Schema.Schema.Encoded<typeof InsertPlaysQuerySchema>

// Error class for fact plays queries
class FactPlaysQueryError extends Data.TaggedError("FactPlaysQueryError")<{
  readonly cause: unknown
  readonly message: string
  readonly queryType: string
}> {}

interface InsertPlaysRequest extends Request.Request<{ num_inserted: number }, FactPlaysQueryError> {
  readonly _tag: "InsertPlaysRequest"
  readonly plays: InsertPlaysQuery
}

const InsertPlaysRequest = Request.tagged<InsertPlaysRequest>("InsertPlaysRequest")

// Request types
interface PlayByIdRequest extends Request.Request<Option.Option<FactPlay>, FactPlaysQueryError> {
  readonly _tag: "PlayByIdRequest"
  readonly queryString: PlayByIdQuery
}

const PlayByIdRequest = Request.tagged<PlayByIdRequest>("PlayByIdRequest")

interface PlaysByArtistRequest extends Request.Request<ReadonlyArray<FactPlay>, FactPlaysQueryError> {
  readonly _tag: "PlaysByArtistRequest"
  readonly queryString: PlaysByArtistQuery
}

const PlaysByArtistRequest = Request.tagged<PlaysByArtistRequest>("PlaysByArtistRequest")

interface PlaysByDateRangeRequest extends Request.Request<ReadonlyArray<FactPlay>, FactPlaysQueryError> {
  readonly _tag: "PlaysByDateRangeRequest"
  readonly queryString: PlaysByDateRangeQuery
}

const PlaysByDateRangeRequest = Request.tagged<PlaysByDateRangeRequest>("PlaysByDateRangeRequest")

interface PlaysByShowRequest extends Request.Request<ReadonlyArray<FactPlay>, FactPlaysQueryError> {
  readonly _tag: "PlaysByShowRequest"
  readonly queryString: PlaysByShowQuery
}

const PlaysByShowRequest = Request.tagged<PlaysByShowRequest>("PlaysByShowRequest")

interface PlaysByRotationStatusRequest extends Request.Request<ReadonlyArray<FactPlay>, FactPlaysQueryError> {
  readonly _tag: "PlaysByRotationStatusRequest"
  readonly queryString: PlaysByRotationStatusQuery
}

const PlaysByRotationStatusRequest = Request.tagged<PlaysByRotationStatusRequest>("PlaysByRotationStatusRequest")

interface LocalPlaysRequest extends Request.Request<ReadonlyArray<FactPlay>, FactPlaysQueryError> {
  readonly _tag: "LocalPlaysRequest"
  readonly queryString: LocalPlaysQuery
}

const LocalPlaysRequest = Request.tagged<LocalPlaysRequest>("LocalPlaysRequest")

export type FactPlaysRequest =
  | PlayByIdRequest
  | PlaysByArtistRequest
  | PlaysByDateRangeRequest
  | PlaysByShowRequest
  | PlaysByRotationStatusRequest
  | LocalPlaysRequest
  | InsertPlaysRequest

export class FactPlaysService extends Effect.Service<FactPlaysService>()("FactPlaysService", {
  accessors: true,
  scoped: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const kexp = yield* KEXPApi

    const InsertPlaysResolver = RequestResolver.fromEffect(
      (request: InsertPlaysRequest) =>
        Effect.gen(function*() {
          const plays = yield* Schema.decodeUnknown(InsertPlaysQuerySchema)(request.plays)
          const query = SqlSchema.single({
            Request: InsertPlaysQuerySchema,
            Result: Schema.Struct({ num_inserted: Schema.Number }),
            execute: (params) =>
              sql.withTransaction(
                sql`INSERT OR IGNORE INTO fact_plays ${sql.insert(Array.ensure(params))}`.pipe(
                  Effect.andThen(sql`SELECT changes() as num_inserted`)
                )
              )
          })
          return yield* query(plays)
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new FactPlaysQueryError({
                cause: error,
                message: `Failed to insert plays: ${error}`,
                queryType: "InsertPlays"
              })
            )
          )
        )
    )

    // Resolver for getting a single play by ID
    const PlayByIdResolver = RequestResolver.fromEffect(
      (request: PlayByIdRequest) =>
        Effect.gen(function*() {
          const [, playId] = yield* Schema.decodeUnknown(PlayByIdQuerySchema)(request.queryString)

          const query = SqlSchema.findOne({
            Request: Schema.Struct({ id: PlayId }),
            Result: FactPlay,
            execute: (params) =>
              sql`
              SELECT * FROM fact_plays 
              WHERE id = ${params.id}
            `
          })

          return yield* query({ id: playId })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new FactPlaysQueryError({
                cause: error,
                message: `Failed to fetch play by ID: ${error}`,
                queryType: "PlayById"
              })
            )
          )
        )
    )

    // Resolver for getting plays by artist
    const PlaysByArtistResolver = RequestResolver.fromEffect(
      (request: PlaysByArtistRequest) =>
        Effect.gen(function*() {
          const [, artist, , limit, , offset] = yield* Schema.decodeUnknown(PlaysByArtistQuerySchema)(
            request.queryString
          )

          const query = SqlSchema.findAll({
            Request: Schema.Struct({
              artist: Schema.String,
              limit: Schema.Number,
              offset: Schema.Number
            }),
            Result: FactPlay,
            execute: (params) =>
              sql`
              SELECT * FROM fact_plays 
              WHERE artist LIKE ${`%${params.artist}%`}
              ORDER BY airdate DESC
              LIMIT ${params.limit}
              OFFSET ${params.offset}
            `
          })

          return yield* query({ artist, limit, offset })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new FactPlaysQueryError({
                cause: error,
                message: `Failed to fetch plays by artist: ${error}`,
                queryType: "PlaysByArtist"
              })
            )
          )
        )
    )

    // Resolver for getting plays by date range
    const PlaysByDateRangeResolver = RequestResolver.fromEffect(
      (request: PlaysByDateRangeRequest) =>
        Effect.gen(function*() {
          const [, fromDate, , toDate, , limit, , offset] = yield* Schema.decodeUnknown(
            PlaysByDateRangeQuerySchema
          )(request.queryString)

          const query = SqlSchema.findAll({
            Request: Schema.Struct({
              start_date: Schema.String,
              end_date: Schema.String,
              limit: Schema.Number,
              offset: Schema.Number
            }),
            Result: FactPlay,
            execute: (params) =>
              sql`
              SELECT * FROM fact_plays 
              WHERE ${
                sql.and([
                  sql`airdate >= ${params.start_date}`,
                  sql`airdate <= ${params.end_date}`
                ])
              }
              ORDER BY airdate DESC
              LIMIT ${params.limit}
              OFFSET ${params.offset}
            `
          })

          return yield* query({ start_date: fromDate, end_date: toDate, limit, offset })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new FactPlaysQueryError({
                cause: error,
                message: `Failed to fetch plays by date range: ${error}`,
                queryType: "PlaysByDateRange"
              })
            )
          )
        )
    )

    // Resolver for getting plays by show
    const PlaysByShowResolver = RequestResolver.fromEffect(
      (request: PlaysByShowRequest) =>
        Effect.gen(function*() {
          const [, showId, , limit, , offset] = yield* Schema.decodeUnknown(PlaysByShowQuerySchema)(
            request.queryString
          )

          const query = SqlSchema.findAll({
            Request: Schema.Struct({
              show: ShowId,
              limit: Schema.Number,
              offset: Schema.Number
            }),
            Result: FactPlay,
            execute: (params) =>
              sql`
              SELECT * FROM fact_plays 
              WHERE show = ${params.show}
              ORDER BY airdate DESC
              LIMIT ${params.limit}
              OFFSET ${params.offset}
            `
          })

          return yield* query({ show: showId, limit, offset })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new FactPlaysQueryError({
                cause: error,
                message: `Failed to fetch plays by show: ${error}`,
                queryType: "PlaysByShow"
              })
            )
          )
        )
    )

    // Resolver for getting plays by rotation status
    const PlaysByRotationStatusResolver = RequestResolver.fromEffect(
      (request: PlaysByRotationStatusRequest) =>
        Effect.gen(function*() {
          const [, rotationStatus, , limit, , offset] = yield* Schema.decodeUnknown(
            PlaysByRotationStatusQuerySchema
          )(request.queryString)

          const query = SqlSchema.findAll({
            Request: Schema.Struct({
              rotation_status: Schema.String,
              limit: Schema.Number,
              offset: Schema.Number
            }),
            Result: FactPlay,
            execute: (params) =>
              sql`
              SELECT * FROM fact_plays 
              WHERE rotation_status = ${params.rotation_status}
              ORDER BY airdate DESC
              LIMIT ${params.limit}
              OFFSET ${params.offset}
            `
          })

          return yield* query({ rotation_status: rotationStatus, limit, offset })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new FactPlaysQueryError({
                cause: error,
                message: `Failed to fetch plays by rotation status: ${error}`,
                queryType: "PlaysByRotationStatus"
              })
            )
          )
        )
    )

    // Resolver for getting local plays
    const LocalPlaysResolver = RequestResolver.fromEffect(
      (request: LocalPlaysRequest) =>
        Effect.gen(function*() {
          const [, isLocal, , limit, , offset] = yield* Schema.decodeUnknown(LocalPlaysQuerySchema)(
            request.queryString
          )

          const query = SqlSchema.findAll({
            Request: Schema.Struct({
              is_local: Schema.Number,
              limit: Schema.Number,
              offset: Schema.Number
            }),
            Result: FactPlay,
            execute: (params) =>
              sql`
              SELECT * FROM fact_plays 
              WHERE is_local = ${params.is_local}
              ORDER BY airdate DESC
              LIMIT ${params.limit}
              OFFSET ${params.offset}
            `
          })

          return yield* query({ is_local: isLocal === "true" ? 1 : 0, limit, offset })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new FactPlaysQueryError({
                cause: error,
                message: `Failed to fetch local plays: ${error}`,
                queryType: "LocalPlays"
              })
            )
          )
        )
    )

    const insertPlays = (plays: InsertPlaysQuery) => Effect.request(InsertPlaysRequest({ plays }), InsertPlaysResolver)

    const getLatestPersistedPlay = () =>
      Effect.gen(function*() {
        const query = SqlSchema.findOne({
          Request: Schema.Struct({}),
          Result: FactPlay,
          execute: () =>
            sql`
            SELECT * FROM fact_plays 
            ORDER BY airdate DESC, id DESC
            LIMIT 1
          `
        })
        return yield* query({})
      })

    const UPDATE_PLAYS_LIMIT = 100
    const updatePlays = Effect.gen(function*() {
      const latestPlay = yield* getLatestPersistedPlay()

      return yield* Stream.paginateEffect(
        `${KEXP_API_URL}/plays?limit=${UPDATE_PLAYS_LIMIT}`,
        (url) =>
          kexp.fetchPlaysFromUrl(url).pipe(
            Effect.map((response) => {
              const plays = response.results.filter(KEXPSchemas.isTrackPlay)
              return [Chunk.fromIterable(plays), Option.fromNullable(response.next)] as const
            })
          )
      )
        .pipe(
          Stream.mapConcatChunk((plays) => plays),
          Stream.takeWhile((play) => {
            if (Option.isNone(latestPlay)) return true

            const latestPlayValue = latestPlay.value
            const playAirdate = DateTime.unsafeMake(play.airdate)
            const latestAirdate = DateTime.unsafeMake(latestPlayValue.airdate)

            if (DateTime.lessThan(playAirdate, latestAirdate)) return false
            if (Equal.equals(playAirdate, latestAirdate) && play.id <= latestPlayValue.id) return false

            return true
          }),
          Stream.grouped(100),
          Stream.mapEffect((chunk) =>
            Effect.gen(function*() {
              const chunkArray = Chunk.toReadonlyArray(chunk)
              const decodedPlays = yield* Schema.decodeUnknown(Schema.Array(factPlayFromKexpPlay))(chunkArray)
              const encodedPlays = yield* Schema.encode(Schema.Array(FactPlay.insert))(decodedPlays)
              const result = yield* insertPlays(encodedPlays)
              return result.num_inserted
            })
          ),
          Stream.runSum
        )
    })

    const getPlayById = (playId: PlayId) =>
      Effect.request(PlayByIdRequest({ queryString: `play:${playId}` }), PlayByIdResolver).pipe(
        Effect.withRequestCaching(true)
      )

    const getPlaysByArtist = (artist: string, pagination: Pagination) =>
      Effect.request(
        PlaysByArtistRequest({
          queryString: `artist:${artist} limit:${pagination.limit} offset:${pagination.offset}`
        }),
        PlaysByArtistResolver
      ).pipe(Effect.withRequestCaching(true))

    const getPlaysByDateRange = (dateRange: DateRange, pagination: Pagination) =>
      Effect.request(
        PlaysByDateRangeRequest({
          queryString:
            `from:${dateRange.start_date} to:${dateRange.end_date} limit:${pagination.limit} offset:${pagination.offset}`
        }),
        PlaysByDateRangeResolver
      ).pipe(Effect.withRequestCaching(true))

    const getPlaysByShow = (showId: ShowId, pagination: Pagination) =>
      Effect.request(
        PlaysByShowRequest({
          queryString: `show:${showId} limit:${pagination.limit} offset:${pagination.offset}`
        }),
        PlaysByShowResolver
      ).pipe(Effect.withRequestCaching(true))

    const getPlaysByRotationStatus = (rotationStatus: string, pagination: Pagination) =>
      Effect.request(
        PlaysByRotationStatusRequest({
          queryString: `rotation:${rotationStatus} limit:${pagination.limit} offset:${pagination.offset}`
        }),
        PlaysByRotationStatusResolver
      ).pipe(Effect.withRequestCaching(true))

    const getLocalPlays = (isLocal: boolean, pagination: Pagination) =>
      Effect.request(
        LocalPlaysRequest({
          queryString: `local:${isLocal} limit:${pagination.limit} offset:${pagination.offset}`
        }),
        LocalPlaysResolver
      ).pipe(Effect.withRequestCaching(true))

    const getRecentPlays = (limit: number = 50, offset: number = 0) =>
      Effect.gen(function*() {
        const query = SqlSchema.findAll({
          Request: Schema.Struct({
            limit: Schema.Int.pipe(Schema.positive()),
            offset: Schema.Int.pipe(Schema.nonNegative())
          }),
          Result: FactPlay,
          execute: (params) =>
            sql`
            SELECT * FROM fact_plays 
            ORDER BY airdate DESC
            LIMIT ${sql.literal(params.limit.toString())}
            OFFSET ${sql.literal(params.offset.toString())}
          `
        })
        return yield* query({ limit, offset })
      })

    const searchPlays = (searchTerm: string, pagination: Pagination) =>
      Effect.gen(function*() {
        const query = SqlSchema.findAll({
          Request: Schema.Struct({
            search: Schema.String,
            limit: Schema.Number,
            offset: Schema.Number
          }),
          Result: FactPlay,
          execute: (params) =>
            sql`
            SELECT * FROM fact_plays 
            WHERE ${
              sql.or([
                sql`artist LIKE ${`%${params.search}%`}`,
                sql`album LIKE ${`%${params.search}%`}`,
                sql`song LIKE ${`%${params.search}%`}`
              ])
            }
            ORDER BY airdate DESC
            LIMIT ${params.limit}
            OFFSET ${params.offset}
          `
        })
        return yield* query({ search: searchTerm, limit: pagination.limit, offset: pagination.offset })
      })

    return {
      // Query methods
      insertPlays,
      updatePlays,
      getPlayById,
      getPlaysByArtist,
      getPlaysByDateRange,
      getPlaysByShow,
      getPlaysByRotationStatus,
      getLocalPlays,

      // Utility methods
      getLatestPersistedPlay,
      getRecentPlays,
      searchPlays,

      // Request constructors for external use
      PlayByIdRequest,
      PlaysByArtistRequest,
      PlaysByDateRangeRequest,
      PlaysByShowRequest,
      PlaysByRotationStatusRequest,
      LocalPlaysRequest
    }
  }).pipe(
    Effect.provide(
      Layer.setRequestCache(
        Request.makeCache({
          capacity: 500,
          timeToLive: Duration.minutes(60)
        })
      )
    )
  ),
  dependencies: [KEXPApi.Default, MusicKBSqlLive]
}) {}
