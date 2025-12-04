import { Schema } from "effect"

// =============================================================================
// MusicBrainz Entity Types
// =============================================================================

export const ArtistType = Schema.Literal("Person", "Group", "Orchestra", "Choir", "Character", "Other")
export type ArtistType = typeof ArtistType.Type

export const LabelRelationType = Schema.Literal(
  "label ownership",
  "label distribution",
  "imprint",
  "label rename",
  "label reissue"
)
export type LabelRelationType = typeof LabelRelationType.Type

export const EventType = Schema.Literal("Concert", "Festival", "Award ceremony", "Convention/Expo")
export type EventType = typeof EventType.Type

// =============================================================================
// Relations JSON Structures (as stored in SQLite)
// =============================================================================

/**
 * Band member relation (artist → band members)
 */
export class BandMemberRelation extends Schema.Class<BandMemberRelation>("BandMemberRelation")({
  mbid: Schema.String,
  name: Schema.String,
  type: Schema.NullOr(ArtistType),
  begin: Schema.NullOr(Schema.String),
  end: Schema.NullOr(Schema.String),
  attributes: Schema.Array(Schema.String).pipe(Schema.withDefault(() => []))
}) {}

/**
 * Member of band relation (person → bands they're in)
 */
export class MemberOfBandRelation extends Schema.Class<MemberOfBandRelation>("MemberOfBandRelation")({
  mbid: Schema.String,
  name: Schema.String,
  type: Schema.NullOr(ArtistType),
  begin: Schema.NullOr(Schema.String),
  end: Schema.NullOr(Schema.String),
  attributes: Schema.Array(Schema.String).pipe(Schema.withDefault(() => []))
}) {}

/**
 * Artist-to-label relation
 */
export class ArtistLabelRelation extends Schema.Class<ArtistLabelRelation>("ArtistLabelRelation")({
  mbid: Schema.String,
  name: Schema.String,
  type: Schema.String, // e.g., "recording contract", "label founder"
  begin: Schema.NullOr(Schema.String),
  end: Schema.NullOr(Schema.String)
}) {}

/**
 * Label-to-label relation
 */
export class LabelLabelRelation extends Schema.Class<LabelLabelRelation>("LabelLabelRelation")({
  mbid: Schema.String,
  name: Schema.String,
  type: LabelRelationType,
  begin: Schema.NullOr(Schema.String),
  end: Schema.NullOr(Schema.String)
}) {}

/**
 * Event relation (from artist)
 */
export class EventRelation extends Schema.Class<EventRelation>("EventRelation")({
  id: Schema.String, // Event MBID
  name: Schema.String,
  type: Schema.String, // Festival, Concert, etc.
  date: Schema.NullOr(Schema.String),
  relation_type: Schema.String // "main performer", "supporting performer"
}) {}

/**
 * URLs object structure
 */
export const UrlsSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Union(Schema.String, Schema.Array(Schema.String))
})

/**
 * Full artist relations JSON structure
 */
export class ArtistRelations extends Schema.Class<ArtistRelations>("ArtistRelations")({
  band_members: Schema.Array(BandMemberRelation).pipe(Schema.withDefault(() => [])),
  member_of_bands: Schema.Array(MemberOfBandRelation).pipe(Schema.withDefault(() => [])),
  collaborators: Schema.Array(Schema.Unknown).pipe(Schema.withDefault(() => [])), // Currently empty
  label_relations: Schema.Array(ArtistLabelRelation).pipe(Schema.withDefault(() => [])),
  events: Schema.Array(EventRelation).pipe(Schema.withDefault(() => [])),
  urls: Schema.optional(UrlsSchema)
}) {}

/**
 * Full label relations JSON structure
 */
export class LabelRelations extends Schema.Class<LabelRelations>("LabelRelations")({
  band_members: Schema.Array(Schema.Unknown).pipe(Schema.withDefault(() => [])), // Not used for labels
  member_of_bands: Schema.Array(Schema.Unknown).pipe(Schema.withDefault(() => [])),
  collaborators: Schema.Array(Schema.Unknown).pipe(Schema.withDefault(() => [])),
  label_relations: Schema.Array(LabelLabelRelation).pipe(Schema.withDefault(() => [])),
  events: Schema.Array(Schema.Unknown).pipe(Schema.withDefault(() => [])),
  urls: Schema.optional(UrlsSchema)
}) {}

// =============================================================================
// Artist Credit (on releases/release groups)
// =============================================================================

/**
 * Single artist credit entry
 */
export class ArtistCreditEntry extends Schema.Class<ArtistCreditEntry>("ArtistCreditEntry")({
  mbid: Schema.String,
  name: Schema.String,
  joinphrase: Schema.String.pipe(Schema.withDefault(() => ""))
}) {}

/**
 * Array of artist credits
 */
export const ArtistCredit = Schema.Array(ArtistCreditEntry)
export type ArtistCredit = typeof ArtistCredit.Type

// =============================================================================
// Label Info (on releases)
// =============================================================================

/**
 * Label info entry on a release
 */
export class LabelInfoEntry extends Schema.Class<LabelInfoEntry>("LabelInfoEntry")({
  label_mbid: Schema.NullOr(Schema.String),
  label_name: Schema.NullOr(Schema.String),
  catalog_number: Schema.NullOr(Schema.String)
}) {}

/**
 * Array of label info
 */
export const LabelInfo = Schema.Array(LabelInfoEntry)
export type LabelInfo = typeof LabelInfo.Type

// =============================================================================
// Materialized Edge Tables (for DuckDB graph queries)
// =============================================================================

/**
 * Artist-to-Artist edge (band membership, collaboration)
 */
export class ArtistEdge extends Schema.Class<ArtistEdge>("ArtistEdge")({
  source_mbid: Schema.String,
  target_mbid: Schema.String,
  relationship_type: Schema.Literal("band_member", "member_of", "collaborator", "supporting_musician"),
  source_name: Schema.NullOr(Schema.String),
  target_name: Schema.NullOr(Schema.String),
  attributes: Schema.NullOr(Schema.String), // JSON array as string
  begin_date: Schema.NullOr(Schema.String),
  end_date: Schema.NullOr(Schema.String)
}) {}

/**
 * Label-to-Label edge (ownership, distribution, imprint)
 */
export class LabelEdge extends Schema.Class<LabelEdge>("LabelEdge")({
  source_mbid: Schema.String,
  target_mbid: Schema.String,
  relationship_type: LabelRelationType,
  source_name: Schema.NullOr(Schema.String),
  target_name: Schema.NullOr(Schema.String),
  begin_date: Schema.NullOr(Schema.String),
  end_date: Schema.NullOr(Schema.String)
}) {}

/**
 * Artist-to-Label edge
 */
export class ArtistLabelEdge extends Schema.Class<ArtistLabelEdge>("ArtistLabelEdge")({
  artist_mbid: Schema.String,
  label_mbid: Schema.String,
  relationship_type: Schema.String,
  artist_name: Schema.NullOr(Schema.String),
  label_name: Schema.NullOr(Schema.String),
  begin_date: Schema.NullOr(Schema.String),
  end_date: Schema.NullOr(Schema.String)
}) {}

/**
 * Artist-to-Event edge
 */
export class ArtistEventEdge extends Schema.Class<ArtistEventEdge>("ArtistEventEdge")({
  artist_mbid: Schema.String,
  event_id: Schema.String,
  relationship_type: Schema.String, // "main performer", "supporting performer"
  artist_name: Schema.NullOr(Schema.String),
  event_name: Schema.NullOr(Schema.String),
  event_type: Schema.NullOr(Schema.String),
  event_date: Schema.NullOr(Schema.String)
}) {}

// =============================================================================
// Graph Query Results
// =============================================================================

/**
 * Band member query result
 */
export class BandMemberResult extends Schema.Class<BandMemberResult>("BandMemberResult")({
  mbid: Schema.String,
  name: Schema.String,
  type: Schema.NullOr(ArtistType),
  attributes: Schema.Array(Schema.String),
  begin_date: Schema.NullOr(Schema.String),
  end_date: Schema.NullOr(Schema.String)
}) {}

/**
 * Collaborator query result (via shared bands)
 */
export class CollaboratorResult extends Schema.Class<CollaboratorResult>("CollaboratorResult")({
  artist_mbid: Schema.String,
  artist_name: Schema.String,
  via_band_mbid: Schema.String,
  via_band_name: Schema.String,
  shared_attributes: Schema.Array(Schema.String) // What they both did (e.g., "vocals")
}) {}

/**
 * Labelmate query result
 */
export class LabelmateResult extends Schema.Class<LabelmateResult>("LabelmateResult")({
  artist_mbid: Schema.String,
  artist_name: Schema.String,
  label_mbid: Schema.String,
  label_name: Schema.String
}) {}

/**
 * Shortest path result
 */
export class PathNode extends Schema.Class<PathNode>("PathNode")({
  mbid: Schema.String,
  name: Schema.String,
  node_type: Schema.Literal("artist", "band", "label"),
  depth: Schema.Number
}) {}

export class ShortestPathResult extends Schema.Class<ShortestPathResult>("ShortestPathResult")({
  source_mbid: Schema.String,
  target_mbid: Schema.String,
  path: Schema.Array(PathNode),
  total_depth: Schema.Number
}) {}

/**
 * Label hierarchy result
 */
export class LabelHierarchyNode extends Schema.Class<LabelHierarchyNode>("LabelHierarchyNode")({
  label_mbid: Schema.String,
  label_name: Schema.String,
  relationship_type: LabelRelationType,
  depth: Schema.Number,
  path: Schema.String // "Universal → Interscope → Aftermath"
}) {}

// =============================================================================
// Graph Statistics
// =============================================================================

/**
 * Summary of graph edge counts
 */
export class GraphStats extends Schema.Class<GraphStats>("GraphStats")({
  artist_artist_edges: Schema.Number,
  label_label_edges: Schema.Number,
  artist_label_edges: Schema.Number,
  artist_event_edges: Schema.Number,
  artist_release_edges: Schema.Number, // via artist_credit
  release_label_edges: Schema.Number   // via label_info
}) {}
