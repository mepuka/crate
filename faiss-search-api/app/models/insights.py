"""
Pydantic models for typed Insight validation.

These models mirror the TypeScript Insight schemas from:
  packages/agent/src/prompts/insights.ts

Field naming uses camelCase to match TypeScript agent output.
Use Field(alias=...) for snake_case API compatibility if needed.

Discriminated union via Pydantic's discriminator pattern:
  https://docs.pydantic.dev/latest/concepts/unions/#discriminated-unions
"""

from typing import Literal, Optional, List, Union, Annotated
from pydantic import BaseModel, Field
from datetime import datetime


# =============================================================================
# Entity References
# =============================================================================

class ArtistRef(BaseModel):
    """Reference to an artist with optional MusicBrainz ID."""
    name: str
    mbid: Optional[str] = None


class RecordingRef(BaseModel):
    """Reference to a recording with optional MusicBrainz ID."""
    title: str
    mbid: Optional[str] = None
    artists: List[ArtistRef] = Field(default_factory=list)


class ReleaseRef(BaseModel):
    """Reference to a release with optional MusicBrainz ID."""
    title: str
    mbid: Optional[str] = None
    releaseGroupMbid: Optional[str] = None


class LabelRef(BaseModel):
    """Reference to a label with optional MusicBrainz ID."""
    name: str
    mbid: Optional[str] = None


# =============================================================================
# Supporting Types
# =============================================================================

class PlayReference(BaseModel):
    """First/last play reference."""
    date: str  # ISO date
    showName: str
    playId: int


class NotableComment(BaseModel):
    """Notable comment from play history."""
    playId: int
    comment: str


# =============================================================================
# Type Literals
# =============================================================================

Confidence = Literal["high", "medium", "low"]
SourceType = Literal["extraction", "database", "external"]
InsightType = Literal[
    "Concert", "Cover", "Sample", "PlayHistory", "Connection", "Link",
    "DiscoveryArc", "LocalScene", "DJRecommendation"  # Phase 2 culture insights
]
EntityType = Literal["recording", "artist", "release", "release_group"]
ConnectionType = Literal["labelmate", "collaborator", "member_of", "same_release_group"]
LinkType = Literal["bandcamp", "wikipedia", "discogs", "article", "video", "social", "other"]
SampleDirection = Literal["samples", "sampled_by"]

# Phase 2: Culture insight type literals
RotationStatus = Literal["Heavy Rotation", "Medium Rotation", "Light Rotation", "Library", "R/N"]
SceneType = Literal["venue", "label", "geographic", "studio"]
RecommendationType = Literal["personal_story", "emotional_connection", "similar_artist", "genre_bridge"]


# =============================================================================
# Base Insight Fields (shared by all insight types)
# =============================================================================

class BaseInsight(BaseModel):
    """Common fields shared by all insight types."""
    playId: int = Field(..., description="Source play ID")
    sourceRecordingMbid: Optional[str] = Field(None, description="MBID of the source recording")
    sourceArtistMbids: List[str] = Field(default_factory=list, description="MBIDs of source artists")
    sourceReleaseMbid: Optional[str] = Field(None, description="MBID of the source release")
    confidence: Confidence = Field(..., description="Confidence level")
    sourceType: SourceType = Field(..., description="Where the insight came from")


# =============================================================================
# Extraction Insights (from DJ comments/play data)
# =============================================================================

class ConcertInsight(BaseInsight):
    """Concert/show mention extracted from DJ comment."""
    model_config = {"populate_by_name": True}

    tag: Literal["Concert"] = Field("Concert", alias="_tag")
    artist: ArtistRef
    venue: Optional[str] = None
    date: Optional[str] = None  # ISO date string
    time: Optional[str] = None  # e.g. "8:00 PM"
    city: Optional[str] = None
    ticketUrl: Optional[str] = None
    tourName: Optional[str] = None
    sourceQuote: str


class CoverInsight(BaseInsight):
    """Cover song reference."""
    model_config = {"populate_by_name": True}

    tag: Literal["Cover"] = Field("Cover", alias="_tag")
    original: RecordingRef
    sourceQuote: str


class SampleInsight(BaseInsight):
    """Sample/sampling relationship."""
    model_config = {"populate_by_name": True}

    tag: Literal["Sample"] = Field("Sample", alias="_tag")
    sampled: RecordingRef
    direction: SampleDirection
    sourceQuote: str


# =============================================================================
# Database Insights (from Crate search)
# =============================================================================

class PlayHistoryInsight(BaseInsight):
    """Play history insight for an entity.

    Note: entityMbid is optional to handle cases where an entity
    (artist, recording, etc.) has play history but no resolved MBID.
    """
    model_config = {"populate_by_name": True}

    tag: Literal["PlayHistory"] = Field("PlayHistory", alias="_tag")
    entityMbid: Optional[str] = None  # Nullable - entity may not have resolved MBID
    entityType: EntityType
    totalPlays: int
    firstPlay: Optional[PlayReference] = None
    lastPlay: Optional[PlayReference] = None
    notableComments: Optional[List[NotableComment]] = None


class ConnectionInsight(BaseInsight):
    """Artist/label connection insight."""
    model_config = {"populate_by_name": True}

    tag: Literal["Connection"] = Field("Connection", alias="_tag")
    fromArtist: ArtistRef
    toArtist: ArtistRef
    connectionType: ConnectionType
    viaLabel: Optional[LabelRef] = None
    mbRelationshipType: Optional[str] = None
    explanation: str


# =============================================================================
# Phase 2: Culture Insights (discovery arc, local scene, DJ recommendations)
# =============================================================================

class RotationPhase(BaseModel):
    """A phase in the rotation journey."""
    status: RotationStatus
    firstDate: str  # ISO date
    lastDate: str   # ISO date
    playCount: int


class DiscoveryArcInsight(BaseInsight):
    """Discovery Arc - Track's journey from debut to KEXP staple."""
    model_config = {"populate_by_name": True}

    tag: Literal["DiscoveryArc"] = Field("DiscoveryArc", alias="_tag")
    artist: ArtistRef
    entityMbid: Optional[str] = None
    entityType: EntityType
    firstPlay: PlayReference
    totalPlays: int
    rotationJourney: List[RotationPhase]
    currentStatus: RotationStatus
    peakStatus: Optional[RotationStatus] = None
    breakthroughPlay: Optional[PlayReference] = None
    narrative: str


class LocalSceneInsight(BaseInsight):
    """Local Scene - Celebrate Seattle/PNW artists."""
    model_config = {"populate_by_name": True}

    tag: Literal["LocalScene"] = Field("LocalScene", alias="_tag")
    artist: ArtistRef
    sceneType: SceneType
    localContext: str  # "Seattle", "Pacific Northwest", etc.
    labelName: Optional[str] = None
    venueName: Optional[str] = None
    sceneArtists: Optional[List[ArtistRef]] = None
    sceneConnection: Optional[str] = None
    narrative: str


class DJRecommendationInsight(BaseInsight):
    """DJ Recommendation - Personal DJ stories and recommendations."""
    model_config = {"populate_by_name": True}

    tag: Literal["DJRecommendation"] = Field("DJRecommendation", alias="_tag")
    recommendationType: RecommendationType
    narrative: str
    relatedArtist: Optional[ArtistRef] = None
    emotionalContext: Optional[str] = None
    sourceQuote: str


# =============================================================================
# External Insights (from links/web)
# =============================================================================

class LinkInsight(BaseInsight):
    """Link content insight."""
    model_config = {"populate_by_name": True}

    tag: Literal["Link"] = Field("Link", alias="_tag")
    relatedEntity: Optional[Union[ArtistRef, RecordingRef, ReleaseRef]] = None
    url: str
    title: str
    summary: str
    linkType: LinkType


# =============================================================================
# Discriminated Union
# =============================================================================

# Pydantic discriminated union using the tag field (aliased from _tag in JSON)
Insight = Annotated[
    Union[
        ConcertInsight,
        CoverInsight,
        SampleInsight,
        PlayHistoryInsight,
        ConnectionInsight,
        LinkInsight,
        # Phase 2: Culture insights
        DiscoveryArcInsight,
        LocalSceneInsight,
        DJRecommendationInsight,
    ],
    Field(discriminator="tag")
]


# =============================================================================
# Evaluation Context Models
# =============================================================================

class ToolCallRecord(BaseModel):
    """Record of a single tool call during research phase."""
    iteration: int
    tool_name: str
    parameters: Optional[dict] = None
    result_summary: Optional[str] = None
    result_count: Optional[int] = None
    duration_ms: Optional[int] = None
    timestamp: str


class EvalContext(BaseModel):
    """
    Evaluation context for an insight batch.

    Captures metadata about the research process that produced the insights.
    This enables:
    - Understanding which tools contributed to insights
    - Measuring research efficiency (iterations, tool calls)
    - A/B testing of prompt variations
    - Debugging and improvement of the agent
    """
    session_id: str
    iteration_count: int
    tools_called: List[str]
    total_tool_calls: int
    research_duration_ms: Optional[int] = None
    model: Optional[str] = None
    had_existing_insights: Optional[bool] = None
    existing_insight_count: Optional[int] = None
    tool_calls: Optional[List[ToolCallRecord]] = None


# =============================================================================
# API Request/Response Models
# =============================================================================

class CreateInsightsRequest(BaseModel):
    """Request to create multiple insights with optional eval context."""
    insights: List[Insight]
    eval_context: Optional[EvalContext] = None


class InsightRecord(BaseModel):
    """Insight record from database (includes metadata)."""
    id: int
    insight_type: InsightType
    play_id: int
    confidence: Confidence
    source_type: SourceType
    data: dict  # Full insight JSON
    summary: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # MBID fields for entity queries
    source_recording_mbid: Optional[str] = None
    source_release_mbid: Optional[str] = None
    referenced_artist_mbid: Optional[str] = None
    referenced_recording_mbid: Optional[str] = None
    referenced_release_mbid: Optional[str] = None
    referenced_label_mbid: Optional[str] = None

    # Evaluation context (optional, for insights with eval tracking)
    eval_context: Optional[dict] = None


class InsightsResponse(BaseModel):
    """Response from insight creation."""
    status: str
    count: int
    insight_ids: List[int] = Field(default_factory=list)


class GetInsightsResponse(BaseModel):
    """Response for fetching insights."""
    insights: List[InsightRecord]
    total: int


class InsightsByTypeResponse(BaseModel):
    """Response grouped by insight type."""
    play_id: int
    insights_by_type: dict[InsightType, List[InsightRecord]]
    total: int


# =============================================================================
# Helper Functions
# =============================================================================

def extract_referenced_mbids(insight: Insight) -> dict:
    """
    Extract referenced MBIDs from an insight for database indexing.

    Returns dict with keys:
      - referenced_artist_mbid
      - referenced_recording_mbid
      - referenced_release_mbid
      - referenced_label_mbid
    """
    mbids = {
        "referenced_artist_mbid": None,
        "referenced_recording_mbid": None,
        "referenced_release_mbid": None,
        "referenced_label_mbid": None,
    }

    tag = insight.tag if hasattr(insight, 'tag') else insight.get("_tag")

    if tag == "Concert":
        if hasattr(insight, 'artist') and insight.artist:
            mbids["referenced_artist_mbid"] = insight.artist.mbid

    elif tag == "Cover":
        if hasattr(insight, 'original') and insight.original:
            mbids["referenced_recording_mbid"] = insight.original.mbid
            if insight.original.artists:
                mbids["referenced_artist_mbid"] = insight.original.artists[0].mbid

    elif tag == "Sample":
        if hasattr(insight, 'sampled') and insight.sampled:
            mbids["referenced_recording_mbid"] = insight.sampled.mbid
            if insight.sampled.artists:
                mbids["referenced_artist_mbid"] = insight.sampled.artists[0].mbid

    elif tag == "PlayHistory":
        entity_type = insight.entityType if hasattr(insight, 'entityType') else insight.get("entityType")
        entity_mbid = insight.entityMbid if hasattr(insight, 'entityMbid') else insight.get("entityMbid")
        if entity_type == "artist":
            mbids["referenced_artist_mbid"] = entity_mbid
        elif entity_type == "recording":
            mbids["referenced_recording_mbid"] = entity_mbid
        elif entity_type in ("release", "release_group"):
            mbids["referenced_release_mbid"] = entity_mbid

    elif tag == "Connection":
        if hasattr(insight, 'toArtist') and insight.toArtist:
            mbids["referenced_artist_mbid"] = insight.toArtist.mbid
        if hasattr(insight, 'viaLabel') and insight.viaLabel:
            mbids["referenced_label_mbid"] = insight.viaLabel.mbid

    elif tag == "Link":
        if hasattr(insight, 'relatedEntity') and insight.relatedEntity:
            entity = insight.relatedEntity
            if isinstance(entity, ArtistRef):
                mbids["referenced_artist_mbid"] = entity.mbid
            elif isinstance(entity, RecordingRef):
                mbids["referenced_recording_mbid"] = entity.mbid
            elif isinstance(entity, ReleaseRef):
                mbids["referenced_release_mbid"] = entity.mbid

    # Phase 2: Culture insights
    elif tag == "DiscoveryArc":
        if hasattr(insight, 'artist') and insight.artist:
            mbids["referenced_artist_mbid"] = insight.artist.mbid
        # Also index entityMbid based on entityType
        entity_type = insight.entityType if hasattr(insight, 'entityType') else None
        entity_mbid = insight.entityMbid if hasattr(insight, 'entityMbid') else None
        if entity_mbid:
            if entity_type == "recording":
                mbids["referenced_recording_mbid"] = entity_mbid
            elif entity_type in ("release", "release_group"):
                mbids["referenced_release_mbid"] = entity_mbid

    elif tag == "LocalScene":
        if hasattr(insight, 'artist') and insight.artist:
            mbids["referenced_artist_mbid"] = insight.artist.mbid

    elif tag == "DJRecommendation":
        if hasattr(insight, 'relatedArtist') and insight.relatedArtist:
            mbids["referenced_artist_mbid"] = insight.relatedArtist.mbid

    return mbids


def generate_summary(insight: Insight) -> str:
    """Generate a brief summary of an insight for display."""
    tag = insight.tag if hasattr(insight, 'tag') else insight.get("_tag")

    if tag == "Concert":
        venue = insight.venue or "venue"
        date = insight.date or "TBD"
        return f"{insight.artist.name} at {venue} on {date}"

    elif tag == "Cover":
        artists = ", ".join(a.name for a in insight.original.artists)
        return f'Cover of "{insight.original.title}" by {artists}'

    elif tag == "Sample":
        direction = "Samples" if insight.direction == "samples" else "Sampled by"
        return f'{direction} "{insight.sampled.title}"'

    elif tag == "PlayHistory":
        return f"{insight.totalPlays} plays on KEXP"

    elif tag == "Connection":
        return f"{insight.fromArtist.name} → {insight.toArtist.name} ({insight.connectionType})"

    elif tag == "Link":
        return f"{insight.linkType}: {insight.title}"

    # Phase 2: Culture insights
    elif tag == "DiscoveryArc":
        return f"{insight.artist.name}: {insight.totalPlays} plays, {insight.currentStatus} (debut: {insight.firstPlay.date})"

    elif tag == "LocalScene":
        label_info = f" ({insight.labelName})" if insight.labelName else ""
        return f"{insight.artist.name}: {insight.localContext} {insight.sceneType}{label_info}"

    elif tag == "DJRecommendation":
        narrative_preview = insight.narrative[:100] + "..." if len(insight.narrative) > 100 else insight.narrative
        return f"{insight.recommendationType}: {narrative_preview}"

    return "Unknown insight"
