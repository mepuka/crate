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
    # New instrument/role queries
    "members_by_instrument", # Get band members who play specific instrument
    # New creator credit queries
    "works_by_creator",  # Get works composed/written by artist
    "work_credits",      # Get who composed/wrote a work
]

InstrumentFilter = Literal[
    "vocals",
    "guitar",
    "bass",
    "drums",
    "keys",
]

CreatorType = Literal[
    "composer",
    "lyricist",
    "writer",
    "arranger",
    "orchestrator",
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
    # Filter parameters for new queries
    instrument: Optional[InstrumentFilter] = Field(
        default=None,
        description="Filter by instrument (for members_by_instrument)"
    )
    creator_type: Optional[CreatorType] = Field(
        default=None,
        description="Filter by creator type (for works_by_creator)"
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
