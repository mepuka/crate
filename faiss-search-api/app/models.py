"""Pydantic models for request/response validation."""
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, ConfigDict


class SearchRequest(BaseModel):
    """Search request model."""

    query: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Semantic search query text",
        examples=["psychedelic rock", "jazz fusion"]
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of results to return"
    )
    offset: int = Field(
        default=0,
        ge=0,
        description="Pagination offset"
    )

    @field_validator('query')
    @classmethod
    def query_not_empty(cls, v: str) -> str:
        """Validate query is not empty or whitespace."""
        if not v.strip():
            raise ValueError('Query cannot be empty or whitespace')
        return v.strip()


class PlayResult(BaseModel):
    """Single play result with metadata and similarity score."""

    model_config = ConfigDict(from_attributes=True)

    # Core fields
    id: int
    artist: str
    song: str
    similarity: float = Field(
        ge=-1.0,
        le=1.0,
        description="Cosine similarity score from FAISS inner product search"
    )

    # Optional metadata
    album: Optional[str] = None
    airdate: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    rotation_status: Optional[str] = None
    is_local: bool = False
    is_live: bool = False
    is_request: bool = False
    comment: Optional[str] = None
    show: int  # Always present in database

    # MusicBrainz IDs (artist_mbid is a JSON array of UUIDs)
    artist_mbid: Optional[List[str]] = None
    recording_mbid: Optional[str] = None
    release_mbid: Optional[str] = None
    release_group_mbid: Optional[str] = None


class SearchResponse(BaseModel):
    """Search response with results and metadata."""

    results: List[PlayResult]
    total: int
    query_time_ms: float
    query: str


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    index_loaded: bool
    database_connected: bool
    total_vectors: int
    embedding_dimension: int
    memory_usage_mb: float
    uptime_seconds: float


class TimelineResponse(BaseModel):
    """Timeline response with cursor-based pagination."""

    results: List[PlayResult]
    next_cursor: Optional[str] = Field(
        None,
        description="Cursor for fetching the next page, None if no more results"
    )
    has_more: bool = Field(
        description="Whether more results exist beyond this page"
    )
    query_time_ms: float = Field(
        description="Query execution time in milliseconds"
    )
    total_count: Optional[int] = Field(
        None,
        description="Total number of plays (only provided for percentage-based queries)"
    )
    anchor_position: Optional[int] = Field(
        None,
        description="Index of anchor play in results (only for anchor-based queries)"
    )
