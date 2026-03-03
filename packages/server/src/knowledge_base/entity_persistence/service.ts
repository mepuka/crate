import { SqlClient, SqlSchema } from "@effect/sql"
import { Data, Duration, Effect, Layer, Request, RequestResolver, Schema } from "effect"
import { MusicKBSqlLive } from "../../sql/Sql.js"
import { ArtistEntity, ArtistMBEntityMaster, EntityType, MbArtistId, PredicateType } from "./schemas.js"

export const ArtistEntityQuerySchema = Schema.TemplateLiteralParser(
  "artist:",
  MbArtistId,
  " entity:",
  EntityType
)
export type ArtistEntityQuery = Schema.Schema.Encoded<typeof ArtistEntityQuerySchema>

export const ArtistRelationQuerySchema = Schema.TemplateLiteralParser(
  "artist:",
  MbArtistId,
  " relation:",
  PredicateType
)
export type ArtistRelationQuery = Schema.Schema.Encoded<typeof ArtistRelationQuerySchema>

export const ArtistEntityRelationQuerySchema = Schema.TemplateLiteralParser(
  "artist:",
  MbArtistId,
  " entity:",
  EntityType,
  " relation:",
  PredicateType
)
export type ArtistEntityRelationQuery = Schema.Schema.Encoded<typeof ArtistEntityRelationQuerySchema>

export const EntityDiscoveryQuerySchema = Schema.TemplateLiteralParser(
  "entity:",
  Schema.String,
  " type:",
  EntityType
)
export type EntityDiscoveryQuery = Schema.Schema.Encoded<typeof EntityDiscoveryQuerySchema>

export class MBQueryError extends Data.TaggedError("MBQueryError")<{
  readonly cause: unknown
  readonly message: string
  readonly queryType: string
}> {}

export interface ArtistEntityRequest extends Request.Request<ReadonlyArray<ArtistEntity>, MBQueryError> {
  readonly _tag: "ArtistEntityRequest"
  readonly queryString: ArtistEntityQuery
}

export const ArtistEntityRequest = Request.tagged<ArtistEntityRequest>("ArtistEntityRequest")

export interface ArtistRelationRequest extends Request.Request<ReadonlyArray<ArtistEntity>, MBQueryError> {
  readonly _tag: "ArtistRelationRequest"
  readonly queryString: ArtistRelationQuery
}

const ArtistRelationRequest = Request.tagged<ArtistRelationRequest>("ArtistRelationRequest")

interface ArtistEntityRelationRequest extends Request.Request<ReadonlyArray<ArtistEntity>, MBQueryError> {
  readonly _tag: "ArtistEntityRelationRequest"
  readonly queryString: ArtistEntityRelationQuery
}

export const ArtistEntityRelationRequest = Request.tagged<ArtistEntityRelationRequest>("ArtistEntityRelationRequest")

interface EntityDiscoveryRequest extends Request.Request<ReadonlyArray<ArtistEntity>, MBQueryError> {
  readonly _tag: "EntityDiscoveryRequest"
  readonly queryString: EntityDiscoveryQuery
}

const EntityDiscoveryRequest = Request.tagged<EntityDiscoveryRequest>("EntityDiscoveryRequest")

interface ArtistEntityInsertRequest extends Request.Request<ArtistMBEntityMaster, MBQueryError> {
  readonly _tag: "ArtistEntityInsertRequest"
  readonly data: Schema.Schema.Type<typeof ArtistMBEntityMaster.insert>
}

const ArtistEntityInsertRequest = Request.tagged<ArtistEntityInsertRequest>("ArtistEntityInsertRequest")

interface DeleteUnresolvedMBArtistsRequest extends Request.Request<MbArtistId, MBQueryError> {
  readonly _tag: "DeleteUnresolvedMBArtistsRequest"
  readonly artist_mb_id: MbArtistId
}
const DeleteUnresolvedMBArtistsRequest = Request.tagged<DeleteUnresolvedMBArtistsRequest>(
  "DeleteUnresolvedMBArtistsRequest"
)

interface ArtistCacheViewRequest extends Request.Request<ReadonlyArray<ArtistEntity>, MBQueryError> {
  readonly _tag: "ArtistCacheViewRequest"
  readonly limit: number
}
const ArtistCacheViewRequest = Request.tagged<ArtistCacheViewRequest>("ArtistCacheViewRequest")

export type MBRequest =
  | ArtistEntityRequest
  | ArtistRelationRequest
  | ArtistEntityRelationRequest
  | EntityDiscoveryRequest
  | ArtistEntityInsertRequest
  | ArtistCacheViewRequest
  | DeleteUnresolvedMBArtistsRequest

export class MBDataService extends Effect.Service<MBDataService>()("MBDataService", {
  accessors: true,
  scoped: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    const ArtistCacheViewResolver = RequestResolver.fromEffect(
      (_request: ArtistCacheViewRequest) =>
        Effect.gen(function*() {
          const query = SqlSchema.findAll({
            Request: Schema.Void,
            Result: ArtistEntity,
            execute: () => sql`SELECT * FROM artist_entity ORDER BY cache_score DESC LIMIT 50000`
          })

          return yield* query(undefined)
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new MBQueryError({
                cause: error,
                message: `Failed to fetch artist cache view: ${error}`,
                queryType: "ArtistCacheView"
              })
            )
          )
        )
    )

    const ArtistEntityResolver = RequestResolver.fromEffect(
      (request: ArtistEntityRequest) =>
        Effect.gen(function*() {
          const [, artistId, , entityType] = yield* Schema.decodeUnknown(ArtistEntityQuerySchema)(request.queryString)

          const query = SqlSchema.findAll({
            Request: Schema.Struct({
              artist_mb_id: MbArtistId,
              entity_type: EntityType
            }),
            Result: ArtistEntity,
            execute: (params) =>
              sql`
                SELECT 
                  artist_mb_id, artist_name, artist_disambiguation,
                  entity_type, entity_mb_id, entity_name,
                  relation_type, direction, attribute_type, entity_metadata
                FROM mb_master_lookup 
                WHERE ${
                sql.and([
                  sql`artist_mb_id = ${sql(params.artist_mb_id)}`,
                  sql`entity_type = ${sql(params.entity_type)}`
                ])
              }
                ORDER BY entity_name
              `
          })

          return yield* query({ artist_mb_id: artistId, entity_type: entityType })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new MBQueryError({
                cause: error,
                message: `Failed to fetch artist entity: ${error}`,
                queryType: "ArtistEntity"
              })
            )
          )
        )
    )

    // Resolver for ArtistRelationRequest
    const ArtistRelationResolver = RequestResolver.fromEffect(
      (request: ArtistRelationRequest) =>
        Effect.gen(function*() {
          const [, artistId, , relationType] = yield* Schema.decodeUnknown(ArtistRelationQuerySchema)(
            request.queryString
          )

          const query = SqlSchema.findAll({
            Request: Schema.Struct({
              artist_mb_id: MbArtistId,
              relation_type: PredicateType
            }),
            Result: ArtistEntity,
            execute: (params) =>
              sql`
                SELECT 
                  artist_mb_id, artist_name, artist_disambiguation,
                  entity_type, entity_mb_id, entity_name,
                  relation_type, direction, attribute_type, entity_metadata
                FROM mb_master_lookup 
                WHERE ${
                sql.and([
                  sql`artist_mb_id = ${sql(params.artist_mb_id)}`,
                  sql`relation_type = ${sql(params.relation_type)}`
                ])
              }
                ORDER BY entity_name
              `
          })

          return yield* query({ artist_mb_id: artistId, relation_type: relationType })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new MBQueryError({
                cause: error,
                message: `Failed to fetch artist relation: ${error}`,
                queryType: "ArtistRelation"
              })
            )
          )
        )
    )

    const DeleteUnresolvedMBArtistsResolver = RequestResolver.fromEffect(
      (request: DeleteUnresolvedMBArtistsRequest) =>
        Effect.gen(function*() {
          yield* Effect.logInfo(`Deleting unresolved MB artist: ${JSON.stringify(request)}`)
          const query = SqlSchema.single({
            Request: MbArtistId,
            Result: Schema.Struct({ artist_mb_id: MbArtistId }),
            execute: (params) =>
              sql`DELETE FROM mb_artist_unresolved WHERE mb_artist_unresolved.artist_mb_id = ${
                sql(params)
              } RETURNING artist_mb_id`
          })

          const { artist_mb_id } = yield* query(request.artist_mb_id)
          return MbArtistId.make(artist_mb_id)
        }).pipe(
          Effect.catchTags({
            NoSuchElementException: () =>
              Effect.logError(`No such element: ${request.artist_mb_id}`).pipe(
                Effect.flatMap(() => Effect.succeed(MbArtistId.make(request.artist_mb_id)))
              )
          }),
          Effect.catchAll((error) =>
            Effect.fail(
              new MBQueryError({
                cause: error,
                message: `Failed to delete unresolved MB artists: ${error}`,
                queryType: "DeleteUnresolvedMBArtists"
              })
            )
          )
        )
    )

    const ArtistEntityInsertResolver = RequestResolver.fromEffect(
      (request: ArtistEntityInsertRequest) =>
        Effect.gen(function*() {
          const query = SqlSchema.single(
            {
              Request: ArtistMBEntityMaster.insert,
              Result: ArtistMBEntityMaster,
              execute: (params) => sql`INSERT OR IGNORE INTO mb_master_lookup ${sql.insert(params)} RETURNING *`
            }
          )

          const result = yield* query(request.data)
          return result
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new MBQueryError({
                cause: error,
                message: `Failed to insert artist entity: ${error}`,
                queryType: "ArtistEntityInsert"
              })
            )
          )
        )
    )

    // Resolver for ArtistEntityRelationRequest
    const ArtistEntityRelationResolver = RequestResolver.fromEffect(
      (request: ArtistEntityRelationRequest) =>
        Effect.gen(function*() {
          const [, artistId, , entityType, , relationType] = yield* Schema.decodeUnknown(
            ArtistEntityRelationQuerySchema
          )(request.queryString)

          const query = SqlSchema.findAll({
            Request: Schema.Struct({
              artist_mb_id: MbArtistId,
              entity_type: EntityType,
              relation_type: PredicateType
            }),
            Result: ArtistEntity,
            execute: (params) =>
              sql`
                SELECT 
                  artist_mb_id, artist_name, artist_disambiguation,
                  entity_type, entity_mb_id, entity_name,
                  relation_type, direction, attribute_type, entity_metadata
                FROM mb_master_lookup 
                WHERE ${
                sql.and([
                  sql`artist_mb_id = ${sql(params.artist_mb_id)}`,
                  sql`entity_type = ${sql(params.entity_type)}`
                ])
              }
                AND relation_type = ${sql(params.relation_type)}
                ORDER BY entity_name
              `
          })

          return yield* query({ artist_mb_id: artistId, entity_type: entityType, relation_type: relationType })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new MBQueryError({
                cause: error,
                message: `Failed to fetch artist entity relation: ${error}`,
                queryType: "ArtistEntityRelation"
              })
            )
          )
        )
    )

    // Resolver for EntityDiscoveryRequest
    const EntityDiscoveryResolver = RequestResolver.fromEffect(
      (request: EntityDiscoveryRequest) =>
        Effect.gen(function*() {
          const [, entityId, , entityType] = yield* Schema.decodeUnknown(EntityDiscoveryQuerySchema)(
            request.queryString
          )

          const query = SqlSchema.findAll({
            Request: Schema.Struct({ entity_mb_id: Schema.String, entity_type: EntityType }),
            Result: ArtistEntity,
            execute: (params) =>
              sql`
                SELECT 
                  artist_mb_id, artist_name, artist_disambiguation,
                  entity_type, entity_mb_id, entity_name,
                  relation_type, direction, attribute_type, entity_metadata
                FROM mb_master_lookup 
                WHERE ${
                sql.and([
                  sql`entity_mb_id = ${sql(params.entity_mb_id)}`,
                  sql`entity_type = ${sql(params.entity_type)}`
                ])
              }
                ORDER BY relation_type, artist_name
              `.pipe(Effect.tap((_) => Effect.logInfo("EntityDiscovery query run!")))
          })

          return yield* query({ entity_mb_id: entityId, entity_type: entityType })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new MBQueryError({
                cause: error,
                message: `Failed to fetch entity discovery: ${error}`,
                queryType: "EntityDiscovery"
              })
            )
          )
        )
    )

    const getArtistEntity = (queryString: ArtistEntityQuery) =>
      Effect.request(ArtistEntityRequest({ queryString }), ArtistEntityResolver).pipe(
        Effect.withRequestCaching(true)
      )

    const getArtistRelation = (queryString: ArtistRelationQuery) =>
      Effect.request(ArtistRelationRequest({ queryString }), ArtistRelationResolver).pipe(
        Effect.withRequestCaching(true)
      )

    const getArtistEntityRelation = (queryString: ArtistEntityRelationQuery) =>
      Effect.request(ArtistEntityRelationRequest({ queryString }), ArtistEntityRelationResolver).pipe(
        Effect.withRequestCaching(true)
      )

    // Query function for entity discovery requests
    const getEntityDiscovery = (queryString: EntityDiscoveryQuery) =>
      Effect.request(EntityDiscoveryRequest({ queryString }), EntityDiscoveryResolver).pipe(
        Effect.withRequestCaching(true)
      )

    const insertArtistEntity = (data: Schema.Schema.Type<typeof ArtistMBEntityMaster.insert>) =>
      Effect.request(ArtistEntityInsertRequest({ data }), ArtistEntityInsertResolver)

    const deleteUnresolvedMBArtists = (artist_mb_id: MbArtistId) =>
      Effect.request(
        DeleteUnresolvedMBArtistsRequest({ artist_mb_id }),
        DeleteUnresolvedMBArtistsResolver
      )

    const getArtistCacheView = Effect.request(ArtistCacheViewRequest({ limit: 50000 }), ArtistCacheViewResolver).pipe(
      Effect.withRequestCaching(true)
    )

    return {
      // Original DSL query methods (unchanged API)

      // New direct query functions
      getArtistEntity,
      getArtistRelation,
      getArtistEntityRelation,
      getArtistCacheView,
      getEntityDiscovery,
      insertArtistEntity,
      deleteUnresolvedMBArtists,

      // Request constructors for external use
      ArtistEntityRequest,
      ArtistCacheViewRequest,
      ArtistRelationRequest,
      ArtistEntityRelationRequest,
      EntityDiscoveryRequest,
      ArtistEntityInsertRequest
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
  dependencies: [MusicKBSqlLive]
}) {}
