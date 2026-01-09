import { Schema } from "effect"

// =============================================================================
// Research Context Types (Phase 1 Output)
// =============================================================================

/**
 * A discovery - first-ever play on KEXP
 */
export class DiscoveryFinding extends Schema.Class<DiscoveryFinding>("DiscoveryFinding")({
  playId: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  album: Schema.NullOr(Schema.String),
  discoveryType: Schema.Literal("first_play", "first_artist", "first_album"),
  significance: Schema.String, // Why this discovery matters
  relatedContext: Schema.NullOr(Schema.String) // Any graph/historical context found
}) {}

/**
 * A fresh release - recently released music
 */
export class FreshReleaseFinding extends Schema.Class<FreshReleaseFinding>("FreshReleaseFinding")({
  playId: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  album: Schema.NullOr(Schema.String),
  releaseDate: Schema.NullOr(Schema.String),
  releaseType: Schema.Literal("single", "album", "ep", "compilation", "unknown"),
  isLocal: Schema.Boolean,
  labelInfo: Schema.NullOr(Schema.String),
  context: Schema.NullOr(Schema.String) // Artist background, why notable
}) {}

/**
 * Rotation status change
 */
export class RotationFinding extends Schema.Class<RotationFinding>("RotationFinding")({
  playId: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  rotationStatus: Schema.NullOr(Schema.String),
  previousStatus: Schema.NullOr(Schema.String),
  playCountToday: Schema.Number,
  significance: Schema.NullOr(Schema.String)
}) {}

/**
 * A thematic pattern found across shows
 */
export class ThemeFinding extends Schema.Class<ThemeFinding>("ThemeFinding")({
  theme: Schema.String, // e.g., "Seattle sound", "90s hip-hop", "ambient electronica"
  description: Schema.String,
  playIds: Schema.Array(Schema.Number), // Plays that exemplify this theme
  showIds: Schema.Array(Schema.Number), // Shows where theme appeared
  crossShowConnections: Schema.NullOr(Schema.String), // How theme manifested differently
  suggestedNarrative: Schema.NullOr(Schema.String) // Potential story angle
}) {}

/**
 * A cultural moment extracted from DJ comments or context
 */
export class CulturalFinding extends Schema.Class<CulturalFinding>("CulturalFinding")({
  type: Schema.Literal("birthday", "anniversary", "death", "event", "theme_day", "other"),
  subject: Schema.String, // Who/what the moment is about
  description: Schema.String,
  playIds: Schema.Array(Schema.Number), // Related plays
  djComment: Schema.NullOr(Schema.String), // Original DJ comment if applicable
  showId: Schema.NullOr(Schema.Number),
  significance: Schema.String // Why this matters
}) {}

/**
 * A notable play worth highlighting
 */
export class NotablePlayFinding extends Schema.Class<NotablePlayFinding>("NotablePlayFinding")({
  playId: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  reason: Schema.String, // Why this play stands out
  category: Schema.Literal("rare", "request", "live", "deep_cut", "connection", "dj_pick", "other"),
  djComment: Schema.NullOr(Schema.String),
  graphConnections: Schema.NullOr(Schema.String), // Any interesting graph relationships
  showContext: Schema.NullOr(Schema.String)
}) {}

/**
 * Graph connection discovered during research
 */
export class GraphConnectionFinding extends Schema.Class<GraphConnectionFinding>("GraphConnectionFinding")({
  sourcePlayId: Schema.Number,
  targetPlayIds: Schema.Array(Schema.Number),
  connectionType: Schema.String, // e.g., "same_producer", "same_label", "member_of"
  description: Schema.String,
  narrative: Schema.NullOr(Schema.String) // Story potential
}) {}

/**
 * Show-level summary for context
 *
 * Note: showName and hostName are nullable until show metadata lookup is implemented
 */
export class ShowSummary extends Schema.Class<ShowSummary>("ShowSummary")({
  showId: Schema.Number,
  showName: Schema.NullOr(Schema.String), // Nullable - show metadata lookup not yet implemented
  hostName: Schema.NullOr(Schema.String),
  playCount: Schema.Number,
  startTime: Schema.String,
  endTime: Schema.String,
  themes: Schema.Array(Schema.String),
  notableComments: Schema.Array(Schema.String),
  highlightPlayIds: Schema.Array(Schema.Number)
}) {}

/**
 * Research context - persisted output from ResearchAgent
 */
export class ResearchContext extends Schema.Class<ResearchContext>("ResearchContext")({
  date: Schema.String, // YYYY-MM-DD

  // Core findings
  discoveries: Schema.Array(DiscoveryFinding),
  freshReleases: Schema.Array(FreshReleaseFinding),
  rotationUpdates: Schema.Array(RotationFinding),

  // Thematic analysis
  themes: Schema.Array(ThemeFinding),
  culturalMoments: Schema.Array(CulturalFinding),

  // Notable plays and connections
  notablePlays: Schema.Array(NotablePlayFinding),
  graphConnections: Schema.Array(GraphConnectionFinding),

  // Show context
  showSummaries: Schema.Array(ShowSummary),

  // Stats
  totalPlays: Schema.Number,
  uniqueArtists: Schema.Number,
  uniqueAlbums: Schema.Number,
  localArtistCount: Schema.Number,
  livePerformanceCount: Schema.Number,
  requestCount: Schema.Number,

  // Research metadata
  researchNotes: Schema.String, // Agent's synthesis notes
  suggestedHeadlines: Schema.Array(Schema.String),
  narrativeAngles: Schema.Array(Schema.String),

  // Processing info
  createdAt: Schema.String,
  durationMs: Schema.Number,
  toolCallCount: Schema.Number
}) {}


// =============================================================================
// Daily Summary Types (Phase 2 Output)
// =============================================================================

/**
 * A highlight moment for the narrative section
 */
export class Highlight extends Schema.Class<Highlight>("Highlight")({
  playId: Schema.Number,
  headline: Schema.String, // Short punchy headline
  description: Schema.String, // 1-2 sentences
  category: Schema.Literal("discovery", "theme", "cultural", "connection", "rare", "local"),
  showName: Schema.NullOr(Schema.String)
}) {}

/**
 * Discovery item for structured section
 */
export class DiscoveryItem extends Schema.Class<DiscoveryItem>("DiscoveryItem")({
  playId: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  album: Schema.NullOr(Schema.String),
  discoveryType: Schema.Literal("first_play", "first_artist", "first_album"),
  blurb: Schema.String // Short description of why notable
}) {}

/**
 * Fresh release item for structured section
 */
export class ReleaseItem extends Schema.Class<ReleaseItem>("ReleaseItem")({
  playId: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  album: Schema.NullOr(Schema.String),
  releaseDate: Schema.NullOr(Schema.String),
  releaseType: Schema.Literal("single", "album", "ep", "compilation", "unknown"),
  isLocal: Schema.Boolean,
  blurb: Schema.String
}) {}

/**
 * Rotation update item
 */
export class RotationItem extends Schema.Class<RotationItem>("RotationItem")({
  playId: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  rotationStatus: Schema.NullOr(Schema.String),
  playCountToday: Schema.Number,
  blurb: Schema.NullOr(Schema.String)
}) {}

/**
 * Theme section for explorers
 */
export class ThemeSection extends Schema.Class<ThemeSection>("ThemeSection")({
  title: Schema.String, // e.g., "Seattle's Sound Dominated the Airwaves"
  description: Schema.String, // 2-3 sentences
  playIds: Schema.Array(Schema.Number), // Representative plays
  showNames: Schema.Array(Schema.String) // Shows where theme appeared
}) {}

/**
 * Cultural moment section
 */
export class CulturalSection extends Schema.Class<CulturalSection>("CulturalSection")({
  type: Schema.Literal("birthday", "anniversary", "death", "event", "theme_day", "other"),
  title: Schema.String,
  description: Schema.String,
  playIds: Schema.Array(Schema.Number),
  source: Schema.NullOr(Schema.String) // DJ name or show if relevant
}) {}

/**
 * Day statistics
 */
export class DayStats extends Schema.Class<DayStats>("DayStats")({
  totalPlays: Schema.Number,
  uniqueArtists: Schema.Number,
  uniqueAlbums: Schema.Number,
  newToKexp: Schema.Number, // First-time plays
  localArtists: Schema.Number,
  livePerformances: Schema.Number,
  listenerRequests: Schema.Number,
  showCount: Schema.Number
}) {}

/**
 * Complete daily summary - the final output
 */
export class DailySummary extends Schema.Class<DailySummary>("DailySummary")({
  date: Schema.String, // YYYY-MM-DD
  headline: Schema.String, // Main headline for the day

  // Narrative layer (casual readers)
  openingNarrative: Schema.String, // 2-3 paragraphs, the day's throughline
  highlights: Schema.Array(Highlight), // 5-8 standout moments

  // Structured sections (explorers)
  discoveries: Schema.Array(DiscoveryItem), // New to KEXP
  freshReleases: Schema.Array(ReleaseItem), // Recent releases
  rotationUpdates: Schema.Array(RotationItem), // Rotation changes

  // Thematic layer
  themes: Schema.Array(ThemeSection), // Cross-show patterns
  culturalMoments: Schema.Array(CulturalSection), // Birthdays, anniversaries, DJ callouts

  // Play references - ALL plays mentioned anywhere, fully resolved
  // Frontend uses these to render playable cards
  playIds: Schema.Array(Schema.Number), // All referenced play IDs
  topPickIds: Schema.Array(Schema.Number), // Must-hear subset (5-10)
  newMusicPlaylistIds: Schema.Array(Schema.Number), // All new music for playlist

  // Footer & metadata
  stats: DayStats,
  generatedAt: Schema.String,
  researchId: Schema.Number // Reference to daily_research table
}) {}


// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request to generate a summary
 */
export class GenerateSummaryRequest extends Schema.Class<GenerateSummaryRequest>("GenerateSummaryRequest")({
  date: Schema.optional(Schema.String), // YYYY-MM-DD, defaults to yesterday
  regenerate: Schema.optional(Schema.Boolean) // Force regeneration even if exists
}) {}

/**
 * Response from generate endpoint
 */
export class GenerateSummaryResponse extends Schema.Class<GenerateSummaryResponse>("GenerateSummaryResponse")({
  status: Schema.Literal("started", "exists", "regenerating"),
  date: Schema.String,
  message: Schema.String,
  summaryId: Schema.NullOr(Schema.Number) // If exists/regenerating
}) {}

/**
 * Summary with resolved plays - what the frontend receives
 */
export class SummaryWithPlays extends Schema.Class<SummaryWithPlays>("SummaryWithPlays")({
  summary: DailySummary,
  // Resolved plays keyed by ID for efficient lookup
  // Frontend can render any playId as a full card
  plays: Schema.Record({ key: Schema.String, value: Schema.Any }) // Map<string, PlayResult>
}) {}


// =============================================================================
// Type Exports
// =============================================================================

export type DiscoveryFindingType = typeof DiscoveryFinding.Type
export type FreshReleaseFindingType = typeof FreshReleaseFinding.Type
export type RotationFindingType = typeof RotationFinding.Type
export type ThemeFindingType = typeof ThemeFinding.Type
export type CulturalFindingType = typeof CulturalFinding.Type
export type NotablePlayFindingType = typeof NotablePlayFinding.Type
export type GraphConnectionFindingType = typeof GraphConnectionFinding.Type
export type ShowSummaryType = typeof ShowSummary.Type
export type ResearchContextType = typeof ResearchContext.Type

export type HighlightType = typeof Highlight.Type
export type DiscoveryItemType = typeof DiscoveryItem.Type
export type ReleaseItemType = typeof ReleaseItem.Type
export type RotationItemType = typeof RotationItem.Type
export type ThemeSectionType = typeof ThemeSection.Type
export type CulturalSectionType = typeof CulturalSection.Type
export type DayStatsType = typeof DayStats.Type
export type DailySummaryType = typeof DailySummary.Type

export type GenerateSummaryRequestType = typeof GenerateSummaryRequest.Type
export type GenerateSummaryResponseType = typeof GenerateSummaryResponse.Type
export type SummaryWithPlaysType = typeof SummaryWithPlays.Type
