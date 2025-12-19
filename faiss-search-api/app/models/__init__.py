"""
Pydantic models for FAISS API.
"""

# Re-export base models (search, timeline, enrichments, etc.)
from .base import (
    SearchRequest,
    SearchResponse,
    PlayResult,
    HealthResponse,
    TableHealth,
    DataHealthResponse,
    TimelineResponse,
    EnrichmentItem,
    EnrichmentRequest,
    EnrichmentResponse,
    BatchPlaysResponse,
    EnrichmentData,
    GetEnrichmentsResponse,
    PlayCountResponse,
    UnprocessedPlaysResponse,
    HybridSearchRequest,
    HybridSearchResponse,
    HybridPlayResult,
)
from .streaming import (
    StreamingLinksRequest,
    StreamingLinksResponse,
    StreamingLink,
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
]

# Re-export graph models
from .graph import (
    GraphQueryType,
    NodeType,
    GraphConnectionsRequest,
    ConnectionNode,
    GraphConnectionsResponse,
)

# Re-export agent run models
from .agent_runs import (
    RunStatus,
    SessionMode,
    ToolCallLogEntry,
    ResearchStep,
    EntityFacts,
    InsightSummary as AgentInsightSummary,
    SaveAgentRunRequest,
    ListAgentRunsParams,
    SaveAgentRunResponse,
    AgentRunSummary,
    AgentRunDetail,
    ListAgentRunsResponse,
    DeleteAgentRunResponse,
)
