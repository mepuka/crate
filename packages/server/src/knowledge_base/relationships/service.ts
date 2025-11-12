import { SqlClient, SqlSchema } from "@effect/sql"
import { Data, Duration, Effect, Layer, Request, RequestResolver, Schema } from "effect"
import { MusicKBSqlLive } from "../../sql/Sql.js"
import { EntityType, NonArtistEntityFromPersistedRel, PersistedRelationship, PredicateType } from "./schemas.js"

// Forward query: Find objects related to a subject via a predicate
export const SubjectPredicateQuerySchema = Schema.TemplateLiteralParser(
  "subject:",
  Schema.String,
  " predicate:",
  PredicateType
)
export type SubjectPredicateQuery = Schema.Schema.Encoded<typeof SubjectPredicateQuerySchema>

// Reverse query: Find subjects related to an object via a predicate
export const ObjectPredicateQuerySchema = Schema.TemplateLiteralParser(
  "object:",
  Schema.String,
  " predicate:",
  PredicateType
)
export type ObjectPredicateQuery = Schema.Schema.Encoded<typeof ObjectPredicateQuerySchema>

// Subject relations: Find all relationships for a subject filtered by object type
export const SubjectTypeQuerySchema = Schema.TemplateLiteralParser(
  "subject:",
  Schema.String,
  " type:",
  EntityType
)
export type SubjectTypeQuery = Schema.Schema.Encoded<typeof SubjectTypeQuerySchema>

// Error class for relationship queries
export class RelationshipQueryError extends Data.TaggedError("RelationshipQueryError")<{
  readonly cause: unknown
  readonly message: string
  readonly queryType: string
}> {}

// Request types
interface SubjectPredicateRequest
  extends Request.Request<ReadonlyArray<PersistedRelationship>, RelationshipQueryError>
{
  readonly _tag: "SubjectPredicateRequest"
  readonly queryString: SubjectPredicateQuery
}

const SubjectPredicateRequest = Request.tagged<SubjectPredicateRequest>("SubjectPredicateRequest")

interface ObjectPredicateRequest extends Request.Request<ReadonlyArray<PersistedRelationship>, RelationshipQueryError> {
  readonly _tag: "ObjectPredicateRequest"
  readonly queryString: ObjectPredicateQuery
}

const ObjectPredicateRequest = Request.tagged<ObjectPredicateRequest>("ObjectPredicateRequest")

interface SubjectTypeRequest
  extends Request.Request<ReadonlyArray<NonArtistEntityFromPersistedRel>, RelationshipQueryError>
{
  readonly _tag: "SubjectTypeRequest"
  readonly queryString: SubjectTypeQuery
}

const SubjectTypeRequest = Request.tagged<SubjectTypeRequest>("SubjectTypeRequest")

interface RelationshipInsertRequest extends Request.Request<void, RelationshipQueryError> {
  readonly _tag: "RelationshipInsertRequest"
  readonly data: Array<Schema.Schema.Type<typeof PersistedRelationship.insert>>
}

const RelationshipInsertRequest = Request.tagged<RelationshipInsertRequest>("RelationshipInsertRequest")

export type RelationshipRequest =
  | SubjectPredicateRequest
  | ObjectPredicateRequest
  | SubjectTypeRequest
  | RelationshipInsertRequest

export class RelationshipService extends Effect.Service<RelationshipService>()("RelationshipService", {
  accessors: true,
  effect: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    const RelationshipInsertResolver = RequestResolver.fromEffect(
      (request: RelationshipInsertRequest) =>
        Effect.gen(function*() {
          const query = SqlSchema.void({
            Request: Schema.Array(PersistedRelationship.insert),
            execute: (params) => sql`INSERT OR IGNORE INTO master_relations ${sql.insert(params)}`
          })

          return yield* query(request.data)
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new RelationshipQueryError({
                cause: error,
                message: `Failed to insert relationships: ${error}`,
                queryType: "RelationshipInsert"
              })
            )
          )
        )
    )

    // Resolver for subject-predicate queries
    const SubjectPredicateResolver = RequestResolver.fromEffect(
      (request: SubjectPredicateRequest) =>
        Effect.gen(function*() {
          const [, subjectId, , predicate] = yield* Schema.decodeUnknown(SubjectPredicateQuerySchema)(
            request.queryString
          )

          const query = SqlSchema.findAll({
            Request: Schema.Struct({ subject_id: Schema.String, predicate: PredicateType }),
            Result: PersistedRelationship,
            execute: (params) =>
              sql`
                SELECT 
                  subject_id, subject_type, subject_name,
                  predicate,
                  object_id, object_type, object_name,
                  attribute_type, source, kexp_play_id,
                  created_at, updated_at
                FROM master_relations 
                WHERE ${
                sql.and([
                  sql`subject_id = ${sql(params.subject_id)}`,
                  sql`predicate = ${sql(params.predicate)}`
                ])
              }
                ORDER BY object_type, object_name
              `
          })

          return yield* query({ subject_id: subjectId, predicate })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new RelationshipQueryError({
                cause: error,
                message: `Failed to fetch subject-predicate relationships: ${error}`,
                queryType: "SubjectPredicate"
              })
            )
          )
        )
    )

    // Resolver for object-predicate queries (reverse lookup)
    const ObjectPredicateResolver = RequestResolver.fromEffect(
      (request: ObjectPredicateRequest) =>
        Effect.gen(function*() {
          const [, objectId, , predicate] = yield* Schema.decodeUnknown(ObjectPredicateQuerySchema)(
            request.queryString
          )

          const query = SqlSchema.findAll({
            Request: Schema.Struct({ object_id: Schema.String, predicate: PredicateType }),
            Result: PersistedRelationship,
            execute: (params) =>
              sql`
                SELECT 
                  subject_id, subject_type, subject_name,
                  predicate,
                  object_id, object_type, object_name,
                  attribute_type, source, kexp_play_id,
                  created_at, updated_at
                FROM master_relations 
                WHERE ${
                sql.and([
                  sql`object_id = ${sql(params.object_id)}`,
                  sql`predicate = ${sql(params.predicate)}`
                ])
              }
                ORDER BY subject_type, subject_name
              `
          })

          return yield* query({ object_id: objectId, predicate })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new RelationshipQueryError({
                cause: error,
                message: `Failed to fetch object-predicate relationships: ${error}`,
                queryType: "ObjectPredicate"
              })
            )
          )
        )
    )

    // Resolver for subject-type queries
    const SubjectTypeResolver = RequestResolver.fromEffect(
      (request: SubjectTypeRequest) =>
        Effect.gen(function*() {
          const [, subjectId, , objectType] = yield* Schema.decodeUnknown(SubjectTypeQuerySchema)(
            request.queryString
          )

          const query = SqlSchema.findAll({
            Request: Schema.Struct({ subject_id: Schema.String, object_type: EntityType }),
            Result: NonArtistEntityFromPersistedRel,
            execute: (params) =>
              sql`
                SELECT 
                  subject_id, subject_type, subject_name,
                  predicate,
                  object_id, object_type, object_name,
                  attribute_type, source, kexp_play_id,
                  created_at, updated_at
                FROM master_relations 
                WHERE ${
                sql.and([
                  sql`subject_id = ${sql(params.subject_id)}`,
                  sql`object_type = ${sql(params.object_type)}`
                ])
              }
                ORDER BY predicate, object_name
              `
          })

          return yield* query({ subject_id: subjectId, object_type: objectType })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new RelationshipQueryError({
                cause: error,
                message: `Failed to fetch subject-type relationships: ${error}`,
                queryType: "SubjectType"
              })
            )
          )
        )
    )

    // Query functions
    const getSubjectPredicate = (queryString: SubjectPredicateQuery) =>
      Effect.request(SubjectPredicateRequest({ queryString }), SubjectPredicateResolver).pipe(
        Effect.withRequestCaching(true)
      )

    const getObjectPredicate = (queryString: ObjectPredicateQuery) =>
      Effect.request(ObjectPredicateRequest({ queryString }), ObjectPredicateResolver).pipe(
        Effect.withRequestCaching(true)
      )

    const getSubjectType = (queryString: SubjectTypeQuery) =>
      Effect.request(SubjectTypeRequest({ queryString }), SubjectTypeResolver).pipe(
        Effect.withRequestCaching(true)
      )

    const insertRelationships = (data: Array<Schema.Schema.Type<typeof PersistedRelationship.insert>>) =>
      Effect.request(RelationshipInsertRequest({ data }), RelationshipInsertResolver)

    // Utility function to get all relationships for a subject
    const getSubjectRelationships = (subjectId: string) =>
      Effect.gen(function*() {
        const query = SqlSchema.findAll({
          Request: Schema.Struct({ subject_id: Schema.String }),
          Result: PersistedRelationship,
          execute: (params) =>
            sql`
              SELECT 
                subject_id, subject_type, subject_name,
                predicate,
                object_id, object_type, object_name,
                attribute_type, source, kexp_play_id,
                created_at, updated_at
              FROM master_relations 
              WHERE subject_id = ${sql(params.subject_id)}
              ORDER BY predicate, object_type, object_name
            `
        })
        return yield* query({ subject_id: subjectId })
      })

    const getArtistSubjectRelationships = (subjectId: string) =>
      Effect.gen(function*() {
        const query = SqlSchema.findAll({
          Request: Schema.Struct({ subject_id: Schema.String }),
          Result: NonArtistEntityFromPersistedRel,
          execute: (params) =>
            sql`
              SELECT 
                subject_id, subject_type, subject_name,
                predicate,
                object_id, object_type, object_name,
                attribute_type, source, kexp_play_id,
                created_at, updated_at
              FROM master_relations mr 
              WHERE ${
              sql.and([
                sql`mr.subject_id = ${sql(params.subject_id)}`,
                sql`mr.subject_type = ${sql("artist")}`,
                sql`mr.object_type in ${
                  sql.in(["recording", "release", "release_group", "work", "label", "area", "genre"])
                }`
              ])
            }
              ORDER BY predicate, object_type, object_name
            `
        })
        return yield* query({ subject_id: subjectId })
      })

    // Utility function to get all relationships for an object
    const getObjectRelationships = (objectId: string) =>
      Effect.gen(function*() {
        const query = SqlSchema.findAll({
          Request: Schema.Struct({ object_id: Schema.String }),
          Result: PersistedRelationship,
          execute: (params) =>
            sql`
              SELECT 
                subject_id, subject_type, subject_name,
                predicate,
                object_id, object_type, object_name,
                attribute_type, source, kexp_play_id,
                created_at, updated_at
              FROM master_relations 
              WHERE object_id = ${sql(params.object_id)}
              ORDER BY predicate, subject_type, subject_name
            `
        })
        return yield* query({ object_id: objectId })
      })

    return {
      // DSL query methods
      getSubjectPredicate,
      getObjectPredicate,
      getSubjectType,

      // Utility methods
      getSubjectRelationships,
      getObjectRelationships,
      getArtistSubjectRelationships,
      insertRelationships,

      // Request constructors for external use
      SubjectPredicateRequest,
      ObjectPredicateRequest,
      SubjectTypeRequest
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
