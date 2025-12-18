import { Schema } from "effect";

// Base Entities
export const ArtistRef = Schema.Struct({
  name: Schema.String,
  mbid: Schema.NullOr(Schema.String)
});

export const RecordingRef = Schema.Struct({
  title: Schema.String,
  mbid: Schema.NullOr(Schema.String),
  artists: Schema.Array(ArtistRef)
});

export const LabelRef = Schema.Struct({
  name: Schema.String,
  mbid: Schema.NullOr(Schema.String)
});

// Insight Variants
export const ConcertInsight = Schema.Struct({
  _tag: Schema.Literal("Concert"),
  artist: ArtistRef,
  venue: Schema.NullOr(Schema.String),
  date: Schema.NullOr(Schema.String), // ISO Date
  sourceQuote: Schema.String
});

export const CoverInsight = Schema.Struct({
  _tag: Schema.Literal("Cover"),
  original: RecordingRef,
  sourceQuote: Schema.String
});

export const SampleInsight = Schema.Struct({
  _tag: Schema.Literal("Sample"),
  sampled: RecordingRef,
  direction: Schema.Literal("samples", "sampled_by"),
  sourceQuote: Schema.String
});

export const PlayHistoryInsight = Schema.Struct({
  _tag: Schema.Literal("PlayHistory"),
  entityMbid: Schema.String,
  entityType: Schema.Literal("recording", "artist", "release", "release_group"),
  totalPlays: Schema.Number,
  firstPlay: Schema.NullOr(Schema.Struct({
      date: Schema.String,
      showName: Schema.String,
      playId: Schema.Number
  })),
  lastPlay: Schema.NullOr(Schema.Struct({
      date: Schema.String,
      showName: Schema.String,
      playId: Schema.Number
  }))
});

export const ConnectionInsight = Schema.Struct({
  _tag: Schema.Literal("Connection"),
  fromArtist: ArtistRef,
  toArtist: ArtistRef,
  connectionType: Schema.Literal("labelmate", "collaborator", "member_of", "same_release_group"),
  viaLabel: Schema.NullOr(LabelRef),
  explanation: Schema.String
});

export const LinkInsight = Schema.Struct({
  _tag: Schema.Literal("Link"),
  url: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  linkType: Schema.Literal("bandcamp", "wikipedia", "discogs", "article", "video", "social", "other")
});

// Phase 2: Culture Insights
export const PlayReference = Schema.Struct({
  date: Schema.String,
  showName: Schema.String,
  playId: Schema.Number
});

export const RotationPhase = Schema.Struct({
  status: Schema.Literal("Heavy Rotation", "Medium Rotation", "Light Rotation", "Library", "R/N"),
  firstDate: Schema.String,
  lastDate: Schema.String,
  playCount: Schema.Number
});

export const DiscoveryArcInsight = Schema.Struct({
  _tag: Schema.Literal("DiscoveryArc"),
  artist: ArtistRef,
  entityMbid: Schema.NullOr(Schema.String),
  entityType: Schema.Literal("recording", "artist", "release", "release_group"),
  firstPlay: PlayReference,
  totalPlays: Schema.Number,
  rotationJourney: Schema.Array(RotationPhase),
  currentStatus: Schema.Literal("Heavy Rotation", "Medium Rotation", "Light Rotation", "Library", "R/N"),
  peakStatus: Schema.NullOr(Schema.Literal("Heavy Rotation", "Medium Rotation", "Light Rotation", "Library", "R/N")),
  breakthroughPlay: Schema.NullOr(PlayReference),
  narrative: Schema.String
});

export const LocalSceneInsight = Schema.Struct({
  _tag: Schema.Literal("LocalScene"),
  artist: ArtistRef,
  sceneType: Schema.Literal("venue", "label", "geographic", "studio"),
  localContext: Schema.String,
  labelName: Schema.NullOr(Schema.String),
  venueName: Schema.NullOr(Schema.String),
  sceneArtists: Schema.NullOr(Schema.Array(ArtistRef)),
  sceneConnection: Schema.NullOr(Schema.String),
  narrative: Schema.String
});

export const DJRecommendationInsight = Schema.Struct({
  _tag: Schema.Literal("DJRecommendation"),
  recommendationType: Schema.Literal("personal_story", "emotional_connection", "similar_artist", "genre_bridge"),
  narrative: Schema.String,
  relatedArtist: Schema.NullOr(ArtistRef),
  emotionalContext: Schema.NullOr(Schema.String),
  sourceQuote: Schema.String
});

// Discriminated Union
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
