import { Model } from "@effect/sql"
import { Data, Schema } from "effect"

// Entity and predicate type enums
export const EntityType = Schema.Literal("artist", "album", "song", "label", "genre", "person", "place")
export const PredicateType = Schema.Literal(
  "performed_by",
  "appears_on",
  "released_by",
  "has_genre",
  "created_by",
  "located_in"
)

// Base relationship fields matching the master_relations table
export class PersistedRelationship extends Model.Class<PersistedRelationship>("PersistedRelationship")({
  subject_id: Schema.String,
  subject_type: Schema.String,
  subject_name: Schema.NullOr(Schema.String),
  predicate: Schema.String,
  object_id: Schema.String,
  object_type: Schema.String,
  object_name: Schema.NullOr(Schema.String),
  attribute_type: Schema.NullOr(Schema.String),
  source: Schema.String,
  kexp_play_id: Schema.NullOr(Schema.Number),
  created_at: Model.DateTimeInsert,
  updated_at: Model.DateTimeUpdate
}) {}

// Domain relationship type (without database timestamps)
export class Relationship extends Data.Class<{
  subject_id: string
  subject_type: string
  subject_name: string | null
  predicate: string
  object_id: string
  object_type: string
  object_name: string | null
  attribute_type: string | null
  source: string
  kexp_play_id: number | null
}> {}

// Schema for the Relationship class
export const RelationshipSchema = Schema.Struct({
  subject_id: Schema.String,
  subject_type: Schema.String,
  subject_name: Schema.NullOr(Schema.String),
  predicate: Schema.String,
  object_id: Schema.String,
  object_type: Schema.String,
  object_name: Schema.NullOr(Schema.String),
  attribute_type: Schema.NullOr(Schema.String),
  source: Schema.String,
  kexp_play_id: Schema.NullOr(Schema.Number)
})

export class PersistedNonArtistRelationship
  extends Model.Class<PersistedNonArtistRelationship>("PersistedNonArtistRelationship")({
    subject_id: Schema.String,
    subject_type: Schema.String,
    subject_name: Schema.NullOr(Schema.String),
    predicate: Schema.String,
    object_id: Schema.String,
    object_type: Schema.String,
    object_name: Schema.NullOr(Schema.String),
    attribute_type: Schema.NullOr(Schema.String),
    source: Schema.String,
    kexp_play_id: Schema.NullOr(Schema.Number),
    created_at: Model.DateTimeInsert,
    updated_at: Model.DateTimeUpdate
  })
{}

// Schema for transforming persisted relationships to domain relationships
export type NonArtistEntityFromPersistedRel = Schema.Schema.Type<typeof NonArtistEntityFromPersistedRel>
export const NonArtistEntityFromPersistedRel = Schema.transform(
  Schema.asSchema(PersistedNonArtistRelationship),
  RelationshipSchema,
  {
    strict: true,
    decode: (persisted) => ({
      subject_id: persisted.subject_id,
      subject_type: persisted.subject_type,
      subject_name: persisted.subject_name,
      predicate: persisted.predicate,
      object_id: persisted.object_id,
      object_type: persisted.object_type,
      object_name: persisted.object_name,
      attribute_type: persisted.attribute_type,
      source: persisted.source,
      kexp_play_id: persisted.kexp_play_id
    }),
    encode: (domain) => ({
      subject_id: domain.subject_id,
      subject_type: domain.subject_type,
      subject_name: domain.subject_name,
      predicate: domain.predicate,
      object_id: domain.object_id,
      object_type: domain.object_type,
      object_name: domain.object_name,
      attribute_type: domain.attribute_type,
      source: domain.source,
      kexp_play_id: domain.kexp_play_id,
      created_at: undefined as any,
      updated_at: undefined as any
    })
  }
)
