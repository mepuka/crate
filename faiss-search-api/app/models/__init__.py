"""
Pydantic models for FAISS API.
"""

# Re-export base models (search, timeline, enrichments, etc.)
from .base import (
    SearchRequest,
    SearchResponse,
    PlayResult,
    HealthResponse,
    TimelineResponse,
    EnrichmentItem,
    EnrichmentRequest,
    EnrichmentResponse,
    BatchPlaysResponse,
    EnrichmentData,
    GetEnrichmentsResponse,
    PlayCountResponse,
    HybridSearchRequest,
    HybridSearchResponse,
    HybridPlayResult,
)

# Re-export insight models
from .insights import (
    # Entity refs
    ArtistRef,
    RecordingRef,
    ReleaseRef,
    LabelRef,
    PlayReference,
    NotableComment,

    # Insight types
    BaseInsight,
    ConcertInsight,
    CoverInsight,
    SampleInsight,
    PlayHistoryInsight,
    ConnectionInsight,
    LinkInsight,
    Insight,

    # Type literals
    Confidence,
    SourceType,
    InsightType,
    EntityType,
    ConnectionType,
    LinkType,
    SampleDirection,

    # API models
    CreateInsightsRequest,
    InsightRecord,
    InsightsResponse,
    GetInsightsResponse,
    InsightsByTypeResponse,

    # Helpers
    extract_referenced_mbids,
    generate_summary,
)

__all__ = [
    # Base models
    "SearchRequest",
    "SearchResponse",
    "PlayResult",
    "HealthResponse",
    "TimelineResponse",
    "EnrichmentItem",
    "EnrichmentRequest",
    "EnrichmentResponse",
    "BatchPlaysResponse",
    "EnrichmentData",
    "GetEnrichmentsResponse",
    "PlayCountResponse",
    "HybridSearchRequest",
    "HybridSearchResponse",
    "HybridPlayResult",

    # Entity refs
    "ArtistRef",
    "RecordingRef",
    "ReleaseRef",
    "LabelRef",
    "PlayReference",
    "NotableComment",

    # Insight types
    "BaseInsight",
    "ConcertInsight",
    "CoverInsight",
    "SampleInsight",
    "PlayHistoryInsight",
    "ConnectionInsight",
    "LinkInsight",
    "Insight",

    # Type literals
    "Confidence",
    "SourceType",
    "InsightType",
    "EntityType",
    "ConnectionType",
    "LinkType",
    "SampleDirection",

    # API models
    "CreateInsightsRequest",
    "InsightRecord",
    "InsightsResponse",
    "GetInsightsResponse",
    "InsightsByTypeResponse",

    # Helpers
    "extract_referenced_mbids",
    "generate_summary",
]
