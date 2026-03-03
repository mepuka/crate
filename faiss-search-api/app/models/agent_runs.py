"""
Pydantic models for Agent Run persistence.

These models support the agent checkpoint API for:
- Crash recovery: Resume interrupted sessions
- Multi-agent handoff: Pass session state between agents
- Observability: Audit trail of agent activity

Field naming uses camelCase to match TypeScript agent output.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# =============================================================================
# Type Literals
# =============================================================================

RunStatus = Literal["running", "completed", "failed", "paused"]
SessionMode = Literal["enrich", "discover"]
ResearchStepType = Literal["search", "graph", "fetch", "analyze", "synthesize"]
EntityType = Literal["artist", "band", "label", "recording", "work", "area", "place"]


# =============================================================================
# Nested Types (from InsightSessionService)
# =============================================================================


class ToolCallLogEntry(BaseModel):
    """Tool call log entry - captures what tools were called and results."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    toolName: str
    params: Any  # Can be any JSON-serializable object
    resultSummary: str
    resultCount: int | None = None
    durationMs: int
    timestamp: int  # Unix timestamp (ms)
    iteration: int


class ResearchStep(BaseModel):
    """Research step - captures agent reasoning at a high level."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    step: ResearchStepType
    description: str
    findings: list[str] = Field(default_factory=list)
    entityMbids: list[str] = Field(default_factory=list)
    timestamp: int  # Unix timestamp (ms)


class EntityFacts(BaseModel):
    """Discovered entity facts - accumulated knowledge about an entity."""

    model_config = ConfigDict(populate_by_name=True)

    mbid: str
    name: str
    type: EntityType
    facts: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    discoveredAt: int  # Unix timestamp (ms)


class InsightSummary(BaseModel):
    """Summary of an insight for session tracking."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    play_id: int
    artist: str
    track: str
    insight_type: str
    summary: str
    created_at: str | None = None
    entity_mbids: list[str] = Field(default_factory=list)
    from_database: bool | None = None


# =============================================================================
# Request Models
# =============================================================================


class SaveAgentRunRequest(BaseModel):
    """Request to save an agent run checkpoint."""

    model_config = ConfigDict(populate_by_name=True)

    sessionId: str = Field(..., alias="session_id", description="Unique session identifier")
    mode: SessionMode = Field(..., description="Agent mode: enrich or discover")
    startedAt: int = Field(..., alias="started_at", description="Start timestamp (Unix ms)")
    completedAt: int | None = Field(
        None, alias="completed_at", description="Completion timestamp (Unix ms)"
    )
    status: RunStatus = Field(..., description="Current run status")
    playIds: list[int] = Field(
        default_factory=list, alias="play_ids", description="Play IDs processed"
    )
    insights: list[InsightSummary] = Field(default_factory=list, description="Insights produced")
    toolCalls: list[ToolCallLogEntry] = Field(
        default_factory=list, alias="tool_calls", description="Tool calls made"
    )
    researchSteps: list[ResearchStep] = Field(
        default_factory=list, alias="research_steps", description="Research steps"
    )
    entities: list[EntityFacts] = Field(default_factory=list, description="Discovered entities")
    errorMessage: str | None = Field(
        None, alias="error_message", description="Error message if failed"
    )
    errorStack: str | None = Field(
        None, alias="error_stack", description="Error stack trace if failed"
    )


class ListAgentRunsParams(BaseModel):
    """Query parameters for listing agent runs."""

    status: RunStatus | None = None
    mode: SessionMode | None = None
    playId: int | None = Field(None, alias="play_id")
    since: str | None = None  # ISO date string
    until: str | None = None  # ISO date string
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


# =============================================================================
# Response Models
# =============================================================================


class SaveAgentRunResponse(BaseModel):
    """Response from saving an agent run."""

    status: Literal["created", "updated"]
    sessionId: str = Field(..., alias="session_id")
    insightCount: int = Field(..., alias="insight_count")
    toolCallCount: int = Field(..., alias="tool_call_count")

    model_config = ConfigDict(populate_by_name=True)


class AgentRunSummary(BaseModel):
    """Summary of an agent run for list queries."""

    model_config = ConfigDict(populate_by_name=True)

    sessionId: str = Field(..., alias="session_id")
    mode: SessionMode
    startedAt: int = Field(..., alias="started_at")
    completedAt: int | None = Field(None, alias="completed_at")
    status: RunStatus
    playIds: list[int] = Field(default_factory=list, alias="play_ids")
    insightCount: int = Field(..., alias="insight_count")
    toolCallCount: int = Field(..., alias="tool_call_count")
    researchStepCount: int = Field(..., alias="research_step_count")
    entityCount: int = Field(..., alias="entity_count")
    durationMs: int | None = Field(None, alias="duration_ms")
    errorMessage: str | None = Field(None, alias="error_message")
    createdAt: str = Field(..., alias="created_at")


class AgentRunDetail(AgentRunSummary):
    """Full agent run with all data."""

    insights: list[InsightSummary] = Field(default_factory=list)
    toolCalls: list[ToolCallLogEntry] = Field(default_factory=list, alias="tool_calls")
    researchSteps: list[ResearchStep] = Field(default_factory=list, alias="research_steps")
    entities: list[EntityFacts] = Field(default_factory=list)
    errorStack: str | None = Field(None, alias="error_stack")
    updatedAt: str = Field(..., alias="updated_at")


class ListAgentRunsResponse(BaseModel):
    """Response from listing agent runs."""

    runs: list[AgentRunSummary]
    total: int
    limit: int
    offset: int


class DeleteAgentRunResponse(BaseModel):
    """Response from deleting an agent run."""

    status: Literal["deleted"]
    sessionId: str = Field(..., alias="session_id")

    model_config = ConfigDict(populate_by_name=True)
