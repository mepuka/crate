import { Schema } from "effect";

// -----------------------------------------------------------------------------
// Entity References (using Schema.Class for consistency)
// -----------------------------------------------------------------------------

/**
 * Reference to an artist with optional MusicBrainz ID
 */
export class ArtistRef extends Schema.Class<ArtistRef>("ArtistRef")({
  name: Schema.String,
  mbid: Schema.NullOr(Schema.String),
}) {}

/**
 * Reference to a recording with optional MusicBrainz ID and artists
 */
export class RecordingRef extends Schema.Class<RecordingRef>("RecordingRef")({
  title: Schema.String,
  mbid: Schema.NullOr(Schema.String),
  artists: Schema.Array(ArtistRef),
}) {}

/**
 * Reference to a label with optional MusicBrainz ID
 */
export class LabelRef extends Schema.Class<LabelRef>("LabelRef")({
  name: Schema.String,
  mbid: Schema.NullOr(Schema.String),
}) {}

// -----------------------------------------------------------------------------
// Supporting Schemas
// -----------------------------------------------------------------------------

/**
 * Reference to a play (for history insights)
 */
export class PlayReference extends Schema.Class<PlayReference>("PlayReference")({
  date: Schema.String,
  showName: Schema.String,
  playId: Schema.Number,
}) {}

/**
 * A phase in the rotation journey
 */
export class RotationPhase extends Schema.Class<RotationPhase>("RotationPhase")({
  status: Schema.Literal("Heavy Rotation", "Medium Rotation", "Light Rotation", "Library", "R/N"),
  firstDate: Schema.String,
  lastDate: Schema.String,
  playCount: Schema.Number,
}) {}

// -----------------------------------------------------------------------------
// Type Literals
// -----------------------------------------------------------------------------

export const SampleDirection = Schema.Literal("samples", "sampled_by");
export type SampleDirection = typeof SampleDirection.Type;

export const EntityType = Schema.Literal("recording", "artist", "release", "release_group");
export type EntityType = typeof EntityType.Type;

export const ConnectionType = Schema.Literal("labelmate", "collaborator", "member_of", "same_release_group");
export type ConnectionType = typeof ConnectionType.Type;

export const LinkType = Schema.Literal("bandcamp", "wikipedia", "discogs", "article", "video", "social", "other");
export type LinkType = typeof LinkType.Type;

export const RotationStatus = Schema.Literal("Heavy Rotation", "Medium Rotation", "Light Rotation", "Library", "R/N");
export type RotationStatus = typeof RotationStatus.Type;

export const SceneType = Schema.Literal("venue", "label", "geographic", "studio");
export type SceneType = typeof SceneType.Type;

export const RecommendationType = Schema.Literal("personal_story", "emotional_connection", "similar_artist", "genre_bridge");
export type RecommendationType = typeof RecommendationType.Type;

// -----------------------------------------------------------------------------
// Insight Variants (using Schema.TaggedClass)
// -----------------------------------------------------------------------------

/**
 * Concert/show mention insight
 */
export class ConcertInsight extends Schema.TaggedClass<ConcertInsight>()(
  "Concert",
  {
    artist: ArtistRef,
    venue: Schema.NullOr(Schema.String),
    date: Schema.NullOr(Schema.String), // ISO Date
    sourceQuote: Schema.String,
  }
) {}

/**
 * Cover song reference insight
 */
export class CoverInsight extends Schema.TaggedClass<CoverInsight>()(
  "Cover",
  {
    original: RecordingRef,
    sourceQuote: Schema.String,
  }
) {}

/**
 * Sample/sampling relationship insight
 */
export class SampleInsight extends Schema.TaggedClass<SampleInsight>()(
  "Sample",
  {
    sampled: RecordingRef,
    direction: SampleDirection,
    sourceQuote: Schema.String,
  }
) {}

/**
 * Play history insight for an entity
 */
export class PlayHistoryInsight extends Schema.TaggedClass<PlayHistoryInsight>()(
  "PlayHistory",
  {
    entityMbid: Schema.String,
    entityType: EntityType,
    totalPlays: Schema.Number,
    firstPlay: Schema.NullOr(PlayReference),
    lastPlay: Schema.NullOr(PlayReference),
  }
) {}

/**
 * Artist/label connection insight
 */
export class ConnectionInsight extends Schema.TaggedClass<ConnectionInsight>()(
  "Connection",
  {
    fromArtist: ArtistRef,
    toArtist: ArtistRef,
    connectionType: ConnectionType,
    viaLabel: Schema.NullOr(LabelRef),
    explanation: Schema.String,
  }
) {}

/**
 * Link content insight
 */
export class LinkInsight extends Schema.TaggedClass<LinkInsight>()(
  "Link",
  {
    url: Schema.String,
    title: Schema.String,
    summary: Schema.String,
    linkType: LinkType,
  }
) {}

// -----------------------------------------------------------------------------
// Phase 2: Culture Insights
// -----------------------------------------------------------------------------

/**
 * Discovery Arc Insight - Track's journey from debut to KEXP staple
 */
export class DiscoveryArcInsight extends Schema.TaggedClass<DiscoveryArcInsight>()(
  "DiscoveryArc",
  {
    artist: ArtistRef,
    entityMbid: Schema.NullOr(Schema.String),
    entityType: EntityType,
    firstPlay: PlayReference,
    totalPlays: Schema.Number,
    rotationJourney: Schema.Array(RotationPhase),
    currentStatus: RotationStatus,
    peakStatus: Schema.NullOr(RotationStatus),
    breakthroughPlay: Schema.NullOr(PlayReference),
    narrative: Schema.String,
  }
) {}

/**
 * Local Scene Insight - Celebrate Seattle/PNW artists
 */
export class LocalSceneInsight extends Schema.TaggedClass<LocalSceneInsight>()(
  "LocalScene",
  {
    artist: ArtistRef,
    sceneType: SceneType,
    localContext: Schema.String,
    labelName: Schema.NullOr(Schema.String),
    venueName: Schema.NullOr(Schema.String),
    sceneArtists: Schema.NullOr(Schema.Array(ArtistRef)),
    sceneConnection: Schema.NullOr(Schema.String),
    narrative: Schema.String,
  }
) {}

/**
 * DJ Recommendation Insight - Personal DJ stories and recommendations
 */
export class DJRecommendationInsight extends Schema.TaggedClass<DJRecommendationInsight>()(
  "DJRecommendation",
  {
    recommendationType: RecommendationType,
    narrative: Schema.String,
    relatedArtist: Schema.NullOr(ArtistRef),
    emotionalContext: Schema.NullOr(Schema.String),
    sourceQuote: Schema.String,
  }
) {}

// -----------------------------------------------------------------------------
// Discriminated Union
// -----------------------------------------------------------------------------

/**
 * Union of all insight types
 */
export const Insight = Schema.Union(
  ConcertInsight,
  CoverInsight,
  SampleInsight,
  PlayHistoryInsight,
  ConnectionInsight,
  LinkInsight,
  // Phase 2: Culture insights
  DiscoveryArcInsight,
  LocalSceneInsight,
  DJRecommendationInsight
);

export type Insight = typeof Insight.Type;
