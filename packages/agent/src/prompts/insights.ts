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
// Discovery & Culture Insights (NEW - Phase 2)
// -----------------------------------------------------------------------------

/**
 * Rotation status for discovery arc tracking
 */
export const RotationStatus = Schema.Literal(
  "Heavy Rotation",
  "Medium Rotation",
  "Light Rotation",
  "Library",
  "R/N" // Recently added / New
);
export type RotationStatus = typeof RotationStatus.Type;

/**
 * A phase in the rotation journey
 */
export class RotationPhase extends Schema.Class<RotationPhase>("RotationPhase")({
  status: RotationStatus,
  firstDate: Schema.String, // ISO date
  lastDate: Schema.String,  // ISO date
  playCount: Schema.Number,
}) {}

/**
 * Discovery Arc Insight - Track's journey from debut to KEXP staple
 *
 * Tells the story of how an artist/recording evolved on KEXP:
 * - First spin (debut moment)
 * - Rotation evolution (Heavy → Medium → Library)
 * - Breakthrough moments
 *
 * @example
 * ```json
 * {
 *   "_tag": "DiscoveryArc",
 *   "playId": 12345,
 *   "confidence": "high",
 *   "sourceType": "database",
 *   "artist": { "name": "Fleet Foxes", "mbid": "..." },
 *   "entityMbid": "...",
 *   "entityType": "artist",
 *   "firstPlay": { "date": "2008-04-15", "showName": "Morning Show", "playId": 1234 },
 *   "totalPlays": 847,
 *   "rotationJourney": [
 *     { "status": "Light Rotation", "firstDate": "2008-04-15", "lastDate": "2008-06-01", "playCount": 8 },
 *     { "status": "Heavy Rotation", "firstDate": "2008-06-15", "lastDate": "2009-03-01", "playCount": 156 },
 *     { "status": "Library", "firstDate": "2009-04-01", "lastDate": "2024-12-17", "playCount": 683 }
 *   ],
 *   "currentStatus": "Library",
 *   "peakStatus": "Heavy Rotation",
 *   "narrative": "Fleet Foxes debuted on KEXP in April 2008, quickly rising to Heavy Rotation..."
 * }
 * ```
 */
export class DiscoveryArcInsight extends Schema.TaggedClass<DiscoveryArcInsight>()(
  "DiscoveryArc",
  {
    ...BaseInsightFields,
    artist: ArtistRef,
    entityMbid: Schema.NullOr(Schema.String),
    entityType: EntityType,
    firstPlay: PlayReference,
    totalPlays: Schema.Number,
    rotationJourney: Schema.Array(RotationPhase),
    currentStatus: RotationStatus,
    peakStatus: Schema.NullOr(RotationStatus), // Highest rotation achieved
    breakthroughPlay: Schema.NullOr(PlayReference), // When they first hit Heavy/Medium
    narrative: Schema.String, // Rich story of their KEXP journey
  }
) {}

/**
 * Scene type for local pride insights
 */
export const SceneType = Schema.Literal(
  "venue",      // Local venue connection
  "label",      // Local label (Sub Pop, Hardly Art, etc.)
  "geographic", // Seattle/PNW origin
  "studio"      // Recorded at local studio
);
export type SceneType = typeof SceneType.Type;

/**
 * Local Scene Insight - Celebrate Seattle/PNW artists
 *
 * Highlights Pacific Northwest connections:
 * - Seattle-based artists
 * - Local label rosters (Sub Pop, Hardly Art, Barsuk)
 * - Recorded at local studios (Avast!, London Bridge)
 * - Local venue history
 *
 * @example
 * ```json
 * {
 *   "_tag": "LocalScene",
 *   "playId": 12345,
 *   "confidence": "high",
 *   "sourceType": "database",
 *   "artist": { "name": "Deep Sea Diver", "mbid": "..." },
 *   "sceneType": "label",
 *   "localContext": "Seattle",
 *   "labelName": "Hardly Art Records",
 *   "sceneArtists": [{ "name": "CHVRCHES", "mbid": "..." }, { "name": "Big Thief", "mbid": "..." }],
 *   "narrative": "Deep Sea Diver is Seattle's own, on the same local label as..."
 * }
 * ```
 */
export class LocalSceneInsight extends Schema.TaggedClass<LocalSceneInsight>()(
  "LocalScene",
  {
    ...BaseInsightFields,
    artist: ArtistRef,
    sceneType: SceneType,
    localContext: Schema.String, // "Seattle", "Pacific Northwest", "Portland"
    labelName: Schema.NullOr(Schema.String),
    venueName: Schema.NullOr(Schema.String), // For "venue" or "studio" types
    sceneArtists: Schema.NullOr(Schema.Array(ArtistRef)), // Related local artists
    sceneConnection: Schema.NullOr(Schema.String), // "grunge pioneers", "indie folk"
    narrative: Schema.String,
  }
) {}

/**
 * Recommendation type for DJ insights
 */
export const RecommendationType = Schema.Literal(
  "personal_story",      // "I first saw this band..."
  "emotional_connection", // "This one always gets me..."
  "similar_artist",      // "If you're into X, check out Y..."
  "genre_bridge"         // "Think X meets Y..."
);
export type RecommendationType = typeof RecommendationType.Type;

/**
 * DJ Recommendation Insight - Personal DJ stories and recommendations
 *
 * Captures the human curation voice:
 * - Personal discovery stories
 * - Emotional connections to tracks
 * - "If you like X..." recommendations
 * - Genre/mood bridges
 *
 * @example
 * ```json
 * {
 *   "_tag": "DJRecommendation",
 *   "playId": 12345,
 *   "confidence": "high",
 *   "sourceType": "extraction",
 *   "recommendationType": "personal_story",
 *   "narrative": "I first heard Fleet Foxes at a tiny house show in the U District...",
 *   "relatedArtist": null,
 *   "emotionalContext": "nostalgia",
 *   "sourceQuote": "I first heard Fleet Foxes at a tiny house show..."
 * }
 * ```
 */
export class DJRecommendationInsight extends Schema.TaggedClass<DJRecommendationInsight>()(
  "DJRecommendation",
  {
    ...BaseInsightFields,
    recommendationType: RecommendationType,
    narrative: Schema.String, // The DJ's full story or recommendation
    relatedArtist: Schema.NullOr(ArtistRef), // For "similar_artist" recommendations
    emotionalContext: Schema.NullOr(Schema.String), // "nostalgia", "energy", "melancholy"
    sourceQuote: Schema.String, // Exact DJ quote
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
  ConnectionInsight,
  DiscoveryArcInsight,
  LocalSceneInsight
);
export type DatabaseInsight = typeof DatabaseInsight.Type;

/**
 * Union of all culture insight types (DJ voice, local pride)
 */
export const CultureInsight = Schema.Union(
  DJRecommendationInsight,
  LocalSceneInsight,
  DiscoveryArcInsight
);
export type CultureInsight = typeof CultureInsight.Type;

/**
 * Union of all external insight types
 */
export const ExternalInsight = LinkInsight;
export type ExternalInsight = typeof ExternalInsight.Type;

/**
 * Union of all insight types
 */
export const Insight = Schema.Union(
  // Extraction insights
  ConcertInsight,
  CoverInsight,
  SampleInsight,
  // Database insights
  PlayHistoryInsight,
  ConnectionInsight,
  // Culture insights (NEW)
  DiscoveryArcInsight,
  LocalSceneInsight,
  DJRecommendationInsight,
  // External insights
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
    case "DiscoveryArc":
      return "Discovery Arc";
    case "LocalScene":
      return "Local Scene";
    case "DJRecommendation":
      return "DJ Recommendation";
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
    case "DiscoveryArc":
      return `${insight.artist.name}: ${insight.totalPlays} plays, ${insight.currentStatus} (debut: ${insight.firstPlay.date})`;
    case "LocalScene":
      return `${insight.artist.name}: ${insight.localContext} ${insight.sceneType}${insight.labelName ? ` (${insight.labelName})` : ""}`;
    case "DJRecommendation":
      return `${insight.recommendationType}: ${insight.narrative.slice(0, 100)}...`;
    case "Link":
      // Include URL so model can detect duplicate links by URL, not just title
      return `${insight.linkType}: ${insight.title} (${insight.url})`;
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
  RotationStatus,
  SceneType,
  RecommendationType,

  // Insight schemas
  ConcertInsight,
  CoverInsight,
  SampleInsight,
  PlayHistoryInsight,
  ConnectionInsight,
  LinkInsight,
  // Culture insights (NEW)
  DiscoveryArcInsight,
  LocalSceneInsight,
  DJRecommendationInsight,

  // Supporting schemas
  PlayReference,
  NotableComment,
  RotationPhase,

  // Union schemas
  ExtractionInsight,
  DatabaseInsight,
  CultureInsight,
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
