"""
Pydantic models for Graph Connections API.

Aligned with TypeScript schemas in packages/agent/src/tools/schemas.ts
"""

from typing import Literal, Optional, List
from pydantic import BaseModel, Field


# =============================================================================
# Type Definitions
# =============================================================================

GraphQueryType = Literal[
    "band_members",      # Get members of a band
    "member_of",         # Get bands an artist is member of
    "labelmates",        # Get artists on same label(s)
    "label_hierarchy",   # Get label ownership tree
    "covers",            # Get cover versions of a work
    "artist_origin",     # Get artist's origin area
    "artists_from_area", # Get artists from an area (by name or MBID)
    "recorded_at",       # Get recordings made at a place
    "collaborators",     # Get artists who shared bands
]

NodeType = Literal[
    "artist",
    "band",
    "label",
    "area",
    "place",
    "recording",
    "work"
]


# =============================================================================
# Request/Response Models
# =============================================================================

class GraphConnectionsRequest(BaseModel):
    """Request for graph connections query."""
    query_type: GraphQueryType = Field(
        ...,
        description="Type of graph query to execute"
    )
    mbids: List[str] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="MusicBrainz IDs to query (max 50)"
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum results per source MBID"
    )
    include_attributes: bool = Field(
        default=True,
        description="Include instrument/role attributes"
    )


class ConnectionNode(BaseModel):
    """Single connection result."""
    mbid: str
    name: str
    node_type: NodeType
    relationship_type: str
    attributes: Optional[List[str]] = None
    begin_date: Optional[str] = None
    end_date: Optional[str] = None
    via_mbid: Optional[str] = None
    via_name: Optional[str] = None


class GraphConnectionsResponse(BaseModel):
    """Response from graph connections query."""
    query_type: GraphQueryType
    source_mbids: List[str]
    connections: List[ConnectionNode]
    total: int
    query_time_ms: float
