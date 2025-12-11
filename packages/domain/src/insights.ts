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

// Discriminated Union
export const Insight = Schema.Union(
  ConcertInsight,
  CoverInsight,
  SampleInsight,
  PlayHistoryInsight,
  ConnectionInsight,
  LinkInsight
);

export type Insight = typeof Insight.Type;
