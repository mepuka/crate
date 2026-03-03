"""
Pydantic models for FAISS API.
"""

# Re-export base models (search, timeline, enrichments, etc.)
from .base import (
    BatchPlaysResponse,
    DataHealthResponse,
    EnrichmentData,
    EnrichmentItem,
    EnrichmentRequest,
    EnrichmentResponse,
    GetEnrichmentsResponse,
    HealthResponse,
    HybridPlayResult,
    HybridSearchRequest,
    HybridSearchResponse,
    PlayCountResponse,
    PlayResult,
    SearchRequest,
    SearchResponse,
    TableHealth,
    TimelineResponse,
    UnprocessedPlaysResponse,
)

# Re-export insight models
from .insights import (
    # Entity refs
    ArtistRef,
    # Insight types
    BaseInsight,
    ConcertInsight,
    # Type literals
    Confidence,
    ConnectionInsight,
    ConnectionType,
    CoverInsight,
    # API models
    CreateInsightsRequest,
    EntityType,
    GetInsightsResponse,
    Insight,
    InsightRecord,
    InsightsByTypeResponse,
    InsightsResponse,
    InsightType,
    LabelRef,
    LinkInsight,
    LinkType,
    NotableComment,
    PlayHistoryInsight,
    PlayReference,
    RecordingRef,
    ReleaseRef,
    SampleDirection,
    SampleInsight,
    SourceType,
    # Helpers
    extract_referenced_mbids,
    generate_summary,
)
from .streaming import (
    StreamingLink,
    StreamingLinksRequest,
    StreamingLinksResponse,
)

__all__ = [
    # Base models
    "SearchRequest",
    "SearchResponse",
    "PlayResult",
    "HealthResponse",
    "TableHealth",
    "DataHealthResponse",
    "TimelineResponse",
    "EnrichmentItem",
    "EnrichmentRequest",
    "EnrichmentResponse",
    "BatchPlaysResponse",
    "EnrichmentData",
    "GetEnrichmentsResponse",
    "PlayCountResponse",
    "UnprocessedPlaysResponse",
    "HybridSearchRequest",
    "HybridSearchResponse",
    "HybridPlayResult",
    "StreamingLinksRequest",
    "StreamingLinksResponse",
    "StreamingLink",
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
    # Graph models
    "GraphQueryType",
    "NodeType",
    "GraphConnectionsRequest",
    "ConnectionNode",
    "GraphConnectionsResponse",
    # Agent run models
    "RunStatus",
    "SessionMode",
    "ToolCallLogEntry",
    "ResearchStep",
    "EntityFacts",
    "AgentInsightSummary",
    "SaveAgentRunRequest",
    "ListAgentRunsParams",
    "SaveAgentRunResponse",
    "AgentRunSummary",
    "AgentRunDetail",
    "ListAgentRunsResponse",
    "DeleteAgentRunResponse",
    # Generated asset models
    "Era",
    "Style",
    "AssetType",
    "AssetMetadata",
    "StoreGeneratedAssetRequest",
    "StoreGeneratedAssetResponse",
    "GeneratedAsset",
    "GetGeneratedAssetsResponse",
]

# Re-export graph models
# Re-export agent run models
from .agent_runs import (
    AgentRunDetail,
    AgentRunSummary,
    DeleteAgentRunResponse,
    EntityFacts,
    ListAgentRunsParams,
    ListAgentRunsResponse,
    ResearchStep,
    RunStatus,
    SaveAgentRunRequest,
    SaveAgentRunResponse,
    SessionMode,
    ToolCallLogEntry,
)
from .agent_runs import (
    InsightSummary as AgentInsightSummary,
)

# Re-export generated asset models
from .generated_assets import (
    AssetMetadata,
    AssetType,
    Era,
    GeneratedAsset,
    GetGeneratedAssetsResponse,
    StoreGeneratedAssetRequest,
    StoreGeneratedAssetResponse,
    Style,
)
from .graph import (
    ConnectionNode,
    GraphConnectionsRequest,
    GraphConnectionsResponse,
    GraphQueryType,
    NodeType,
)
