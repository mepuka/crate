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
  attributes: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] })
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
  attributes: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] })
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
  band_members: Schema.optionalWith(Schema.Array(BandMemberRelation), { default: () => [] }),
  member_of_bands: Schema.optionalWith(Schema.Array(MemberOfBandRelation), { default: () => [] }),
  collaborators: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }), // Currently empty
  label_relations: Schema.optionalWith(Schema.Array(ArtistLabelRelation), { default: () => [] }),
  events: Schema.optionalWith(Schema.Array(EventRelation), { default: () => [] }),
  urls: Schema.optional(UrlsSchema)
}) {}

/**
 * Full label relations JSON structure
 */
export class LabelRelations extends Schema.Class<LabelRelations>("LabelRelations")({
  band_members: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }), // Not used for labels
  member_of_bands: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }),
  collaborators: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }),
  label_relations: Schema.optionalWith(Schema.Array(LabelLabelRelation), { default: () => [] }),
  events: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }),
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
  joinphrase: Schema.optionalWith(Schema.String, { default: () => "" })
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

// =============================================================================
// Graph Connections API Contract (shared with agent/tools)
// =============================================================================

/**
 * Supported query types for graph connections
 *
 * **Basic queries (9):**
 * - `band_members` - Get members of a band
 * - `member_of` - Get bands an artist is member of
 * - `labelmates` - Get artists on same label(s)
 * - `label_hierarchy` - Get label ownership tree
 * - `covers` - Get cover/live/other versions (supports version_type filter)
 * - `artist_origin` - Get artist's origin area
 * - `artists_from_area` - Get artists from an area
 * - `recorded_at` - Get recordings from a place
 * - `collaborators` - Get artists who shared bands (2-hop)
 *
 * **Extended queries (4):**
 * - `collaborators_direct` - Direct collaborations (supports collaboration_type)
 * - `members_by_instrument` - Band members by instrument (supports instrument)
 * - `works_by_creator` - Works by composer/lyricist (supports creator_type)
 * - `work_credits` - Who composed/wrote a work
 */
export const GraphQueryType = Schema.Literal(
  "band_members",
  "member_of",
  "labelmates",
  "label_hierarchy",
  "covers",
  "artist_origin",
  "artists_from_area",
  "recorded_at",
  "collaborators",
  // New expanded graph queries
  "collaborators_direct",    // Direct artist collaborations (featured, production, writing)
  "members_by_instrument",   // Band members filtered by instrument
  "works_by_creator",        // Works composed/written by artist
  "work_credits"             // Who composed/wrote a work
)
export type GraphQueryType = typeof GraphQueryType.Type

/**
 * Filter types for `covers` query - specifies the version type to search for.
 * Use with query_type: "covers" to filter by specific recording attributes.
 */
export const VersionType = Schema.Literal("cover", "live", "medley", "instrumental")
export type VersionType = typeof VersionType.Type

/**
 * Filter types for `collaborators_direct` query - specifies collaboration category.
 * - "featured" - Guest appearances on tracks
 * - "production" - Producer/engineer credits
 * - "writing" - Co-writing credits
 */
export const CollaborationType = Schema.Literal("featured", "production", "writing")
export type CollaborationType = typeof CollaborationType.Type

/**
 * Filter types for `members_by_instrument` query - specifies instrument category.
 * Returns band members who played the specified instrument role.
 */
export const InstrumentFilter = Schema.Literal("vocals", "guitar", "bass", "drums", "keys")
export type InstrumentFilter = typeof InstrumentFilter.Type

/**
 * Filter types for `works_by_creator` query - specifies creator role.
 * - "composer" - Wrote the music
 * - "lyricist" - Wrote the lyrics
 * - "writer" - Combined composer/lyricist
 * - "arranger" - Created arrangement
 * - "orchestrator" - Orchestration credits
 */
export const CreatorType = Schema.Literal("composer", "lyricist", "writer", "arranger", "orchestrator")
export type CreatorType = typeof CreatorType.Type

/**
 * Request to fetch connections for one or more MBIDs
 *
 * Note: keep fields primitive/optional for JSON Schema compatibility in tools.
 */
export const GraphConnectionsRequest = Schema.Struct({
  query_type: GraphQueryType,
  mbids: Schema.Array(Schema.String),
  limit: Schema.optional(Schema.Number),
  include_attributes: Schema.optional(Schema.Boolean),
  // Filter parameters for specific query types
  version_type: Schema.optional(VersionType),           // For covers query
  collaboration_type: Schema.optional(CollaborationType), // For collaborators_direct query
  instrument: Schema.optional(InstrumentFilter),        // For members_by_instrument query
  creator_type: Schema.optional(CreatorType)            // For works_by_creator query
})
export type GraphConnectionsRequest = typeof GraphConnectionsRequest.Type

/**
 * A single connection node in the graph response
 */
// Helper for nullable fields that works around Bun transpiler bug with NullOr/NullishOr
const NullableString = Schema.Union(Schema.String, Schema.Null, Schema.Undefined)
const NullableStringArray = Schema.Union(Schema.Array(Schema.String), Schema.Null, Schema.Undefined)

export const ConnectionNode = Schema.Struct({
  mbid: Schema.String,
  name: Schema.String,
  node_type: Schema.Literal("artist", "band", "label", "recording", "work", "area", "place"),
  relationship_type: Schema.String,
  // These fields are nullable in the Python / FastAPI models.
  // Using explicit Union to work around Bun transpiler bug with NullOr/NullishOr
  attributes: NullableStringArray,
  begin_date: NullableString,
  end_date: NullableString,
  via_mbid: NullableString,
  via_name: NullableString
})
export type ConnectionNode = typeof ConnectionNode.Type

/**
 * Response payload for graph connections
 */
export const GraphConnectionsResponse = Schema.Struct({
  query_type: GraphQueryType,
  source_mbids: Schema.Array(Schema.String),
  connections: Schema.Array(ConnectionNode),
  total: Schema.Number,
  query_time_ms: Schema.Number
})
export type GraphConnectionsResponse = typeof GraphConnectionsResponse.Type
