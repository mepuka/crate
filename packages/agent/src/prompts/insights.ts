/**
 * Crate Agent Insight Schemas
 *
 * Typed insight schemas using Effect Schema for validation and encoding.
 * These define the structured output format for the Crate Research Agent.
 *
 * @module
 */

import { Schema } from "effect";

// -----------------------------------------------------------------------------
// Entity References
// -----------------------------------------------------------------------------

/**
 * Reference to an artist with optional MusicBrainz ID
 */
export class ArtistRef extends Schema.Class<ArtistRef>("ArtistRef")({
  name: Schema.String,
  mbid: Schema.NullOr(Schema.String),
}) {}

/**
 * Reference to a recording with optional MusicBrainz ID
 */
export class RecordingRef extends Schema.Class<RecordingRef>("RecordingRef")({
  title: Schema.String,
  mbid: Schema.NullOr(Schema.String),
  artists: Schema.Array(ArtistRef),
}) {}

/**
 * Reference to a release with optional MusicBrainz ID
 */
export class ReleaseRef extends Schema.Class<ReleaseRef>("ReleaseRef")({
  title: Schema.String,
  mbid: Schema.NullOr(Schema.String),
  releaseGroupMbid: Schema.NullOr(Schema.String),
}) {}

/**
 * Reference to a label with optional MusicBrainz ID
 */
export class LabelRef extends Schema.Class<LabelRef>("LabelRef")({
  name: Schema.String,
  mbid: Schema.NullOr(Schema.String),
}) {}

// -----------------------------------------------------------------------------
// Confidence & Source Types
// -----------------------------------------------------------------------------

/**
 * Confidence level for extracted insights
 */
export const Confidence = Schema.Literal("high", "medium", "low");
export type Confidence = typeof Confidence.Type;

/**
 * Source type indicating where the insight came from
 */
export const SourceType = Schema.Literal("extraction", "database", "external");
export type SourceType = typeof SourceType.Type;

// -----------------------------------------------------------------------------
// Base Insight
// -----------------------------------------------------------------------------

/**
 * Common fields shared by all insight types
 *
 * Note: sourceArtistMbids defaults to empty array when not provided,
 * allowing graceful handling of plays without resolved artist MBIDs.
 */
const BaseInsightFields = {
  playId: Schema.Number,
  sourceRecordingMbid: Schema.NullOr(Schema.String),
  sourceArtistMbids: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [],
  }),
  sourceReleaseMbid: Schema.NullOr(Schema.String),
  confidence: Confidence,
  sourceType: SourceType,
};

// -----------------------------------------------------------------------------
// Extraction Insights (from DJ comments/play data)
// -----------------------------------------------------------------------------

/**
 * Concert/show mention extracted from DJ comment
 *
 * @example
 * ```json
 * {
 *   "_tag": "Concert",
 *   "playId": 12345,
 *   "sourceArtistMbids": ["6393dd04-27de-4340-9807-f9f5e7ad6d14"],
 *   "confidence": "high",
 *   "sourceType": "extraction",
 *   "artist": { "name": "Fleet Foxes", "mbid": "..." },
 *   "venue": "The Paramount Theatre",
 *   "date": "2025-03-15",
 *   "city": "Seattle",
 *   "sourceQuote": "Catch them at the Paramount March 15th"
 * }
 * ```
 */
export class ConcertInsight extends Schema.TaggedClass<ConcertInsight>()(
  "Concert",
  {
    ...BaseInsightFields,
    artist: ArtistRef,
    venue: Schema.NullOr(Schema.String),
    date: Schema.NullOr(Schema.String), // ISO date string
    time: Schema.NullOr(Schema.String), // e.g. "8:00 PM"
    city: Schema.NullOr(Schema.String),
    ticketUrl: Schema.NullOr(Schema.String),
    tourName: Schema.NullOr(Schema.String),
    sourceQuote: Schema.String,
  }
) {}

/**
 * Cover song reference
 */
export class CoverInsight extends Schema.TaggedClass<CoverInsight>()("Cover", {
  ...BaseInsightFields,
  original: RecordingRef,
  sourceQuote: Schema.String,
}) {}

/**
 * Sample/sampling relationship
 */
export const SampleDirection = Schema.Literal("samples", "sampled_by");
export type SampleDirection = typeof SampleDirection.Type;

export class SampleInsight extends Schema.TaggedClass<SampleInsight>()(
  "Sample",
  {
    ...BaseInsightFields,
    sampled: RecordingRef,
    direction: SampleDirection,
    sourceQuote: Schema.String,
  }
) {}

// -----------------------------------------------------------------------------
// Database Insights (from Crate search)
// -----------------------------------------------------------------------------

/**
 * Entity type for play history
 */
export const EntityType = Schema.Literal(
  "recording",
  "artist",
  "release",
  "release_group"
);
export type EntityType = typeof EntityType.Type;

/**
 * First/last play reference
 */
export class PlayReference extends Schema.Class<PlayReference>("PlayReference")(
  {
    date: Schema.String, // ISO date
    showName: Schema.String,
    playId: Schema.Number,
  }
) {}

/**
 * Notable comment from play history
 */
export class NotableComment extends Schema.Class<NotableComment>(
  "NotableComment"
)({
  playId: Schema.Number,
  comment: Schema.String,
}) {}

/**
 * Play history insight for an entity
 *
 * Note: entityMbid is nullable to handle cases where an entity
 * (artist, recording, etc.) has play history but no resolved MBID.
 */
export class PlayHistoryInsight extends Schema.TaggedClass<PlayHistoryInsight>()(
  "PlayHistory",
  {
    ...BaseInsightFields,
    entityMbid: Schema.NullOr(Schema.String),
    entityType: EntityType,
    totalPlays: Schema.Number,
    firstPlay: Schema.NullOr(PlayReference),
    lastPlay: Schema.NullOr(PlayReference),
    notableComments: Schema.NullOr(Schema.Array(NotableComment)),
  }
) {}

/**
 * Connection type between artists
 */
export const ConnectionType = Schema.Literal(
  "labelmate",
  "collaborator",
  "member_of",
  "same_release_group"
);
export type ConnectionType = typeof ConnectionType.Type;

/**
 * Artist/label connection insight
 */
export class ConnectionInsight extends Schema.TaggedClass<ConnectionInsight>()(
  "Connection",
  {
    ...BaseInsightFields,
    fromArtist: ArtistRef,
    toArtist: ArtistRef,
    connectionType: ConnectionType,
    viaLabel: Schema.NullOr(LabelRef),
    mbRelationshipType: Schema.NullOr(Schema.String),
    explanation: Schema.String,
  }
) {}

// -----------------------------------------------------------------------------
// External Insights (from links/web)
// -----------------------------------------------------------------------------

/**
 * Link type classification
 */
export const LinkType = Schema.Literal(
  "bandcamp",
  "wikipedia",
  "discogs",
  "article",
  "video",
  "social",
  "other"
);
export type LinkType = typeof LinkType.Type;

/**
 * Related entity for a link (can be artist, recording, or release)
 */
export const RelatedEntity = Schema.Union(ArtistRef, RecordingRef, ReleaseRef);
export type RelatedEntity = typeof RelatedEntity.Type;

/**
 * Link content insight
 */
export class LinkInsight extends Schema.TaggedClass<LinkInsight>()("Link", {
  ...BaseInsightFields,
  relatedEntity: Schema.NullOr(RelatedEntity),
  url: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  linkType: LinkType,
}) {}

// -----------------------------------------------------------------------------
// Union Types
// -----------------------------------------------------------------------------

/**
 * Union of all extraction insight types
 */
export const ExtractionInsight = Schema.Union(
  ConcertInsight,
  CoverInsight,
  SampleInsight
);
export type ExtractionInsight = typeof ExtractionInsight.Type;

/**
 * Union of all database insight types
 */
export const DatabaseInsight = Schema.Union(
  PlayHistoryInsight,
  ConnectionInsight
);
export type DatabaseInsight = typeof DatabaseInsight.Type;

/**
 * Union of all external insight types
 */
export const ExternalInsight = LinkInsight;
export type ExternalInsight = typeof ExternalInsight.Type;

/**
 * Union of all insight types
 */
export const Insight = Schema.Union(
  ConcertInsight,
  CoverInsight,
  SampleInsight,
  PlayHistoryInsight,
  ConnectionInsight,
  LinkInsight
);
export type Insight = typeof Insight.Type;

/**
 * Array of insights (the typical agent output)
 */
export const InsightArray = Schema.Array(Insight);
export type InsightArray = typeof InsightArray.Type;

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Get a human-readable label for an insight type
 */
export function getInsightLabel(insight: Insight): string {
  switch (insight._tag) {
    case "Concert":
      return "Concert";
    case "Cover":
      return "Cover Song";
    case "Sample":
      return insight.direction === "samples" ? "Samples" : "Sampled By";
    case "PlayHistory":
      return "Play History";
    case "Connection":
      return "Connection";
    case "Link":
      return "Link";
  }
}

/**
 * Get a brief summary of an insight for context
 */
export function getInsightSummary(insight: Insight): string {
  switch (insight._tag) {
    case "Concert":
      return `${insight.artist.name} at ${insight.venue ?? "venue"} on ${insight.date ?? "TBD"}`;
    case "Cover":
      return `Cover of "${insight.original.title}" by ${insight.original.artists.map((a) => a.name).join(", ")}`;
    case "Sample":
      return `${insight.direction === "samples" ? "Samples" : "Sampled by"} "${insight.sampled.title}"`;
    case "PlayHistory":
      return `${insight.totalPlays} plays on KEXP`;
    case "Connection":
      return `${insight.fromArtist.name} → ${insight.toArtist.name} (${insight.connectionType})`;
    case "Link":
      return `${insight.linkType}: ${insight.title}`;
  }
}

// -----------------------------------------------------------------------------
// Namespace Export
// -----------------------------------------------------------------------------

export const CrateInsights = {
  // Entity references
  ArtistRef,
  RecordingRef,
  ReleaseRef,
  LabelRef,

  // Type literals
  Confidence,
  SourceType,
  EntityType,
  ConnectionType,
  LinkType,
  SampleDirection,

  // Insight schemas
  ConcertInsight,
  CoverInsight,
  SampleInsight,
  PlayHistoryInsight,
  ConnectionInsight,
  LinkInsight,

  // Supporting schemas
  PlayReference,
  NotableComment,

  // Union schemas
  ExtractionInsight,
  DatabaseInsight,
  ExternalInsight,
  Insight,
  InsightArray,

  // Helpers
  getInsightLabel,
  getInsightSummary,
};

export default CrateInsights;

// -----------------------------------------------------------------------------
// Encoded Schemas for generateObject (JSON Schema Compatibility)
// -----------------------------------------------------------------------------

/**
 * Schemas used by generateObject for structured insights output.
 *
 * We reuse the canonical Insight union so there is a single source of truth
 * for the insight shape. The model's JSON is validated against these schemas.
 */
export const InsightEncoded = Insight;

export const InsightArrayEncoded = InsightArray;

export const InsightsResponseEncoded = Schema.Struct({
  insights: InsightArrayEncoded,
});
export type InsightsResponseEncoded = typeof InsightsResponseEncoded.Type;
