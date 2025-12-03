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
    release_date: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    rotation_status: Optional[str] = None
    is_local: bool = False
    is_live: bool = False
    is_request: bool = False
    comment: Optional[str] = None
    show: int  # Always present in database

    # Album artwork URLs
    image_uri: Optional[str] = None
    thumbnail_uri: Optional[str] = None

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


class HybridSearchRequest(BaseModel):
    """Hybrid search request model."""

    query: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Search query text",
        examples=["Funkadelic", "upbeat electronic dance"]
    )
    limit: int = Field(
        default=50,
        ge=1,
        le=200,
        description="Maximum number of results to return"
    )
    bm25_weight: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Weight for BM25 keyword search (0-1)"
    )
    faiss_weight: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Weight for FAISS semantic search (0-1)"
    )
    use_expansion: bool = Field(
        default=True,
        description="Apply query expansion (artist aliases, genre synonyms)"
    )

    @field_validator('query')
    @classmethod
    def query_not_empty(cls, v: str) -> str:
        """Validate query is not empty or whitespace."""
        if not v.strip():
            raise ValueError('Query cannot be empty or whitespace')
        return v.strip()


class HybridPlayResult(BaseModel):
    """Hybrid search result with RRF scores and ranking info."""

    model_config = ConfigDict(from_attributes=True)

    # Core fields
    id: int
    artist: str
    song: str
    rrf_score: float = Field(
        description="Reciprocal Rank Fusion score (higher = better)"
    )

    # Ranking info
    bm25_rank: Optional[int] = Field(None, description="Rank in BM25 results (None if not found)")
    faiss_rank: Optional[int] = Field(None, description="Rank in FAISS results (None if not found)")
    faiss_score: Optional[float] = Field(None, description="FAISS similarity score")

    # Optional metadata
    album: Optional[str] = None
    airdate: Optional[str] = None
    release_date: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    rotation_status: Optional[str] = None
    is_local: bool = False
    is_live: bool = False
    is_request: bool = False
    comment: Optional[str] = None
    show: int = 0

    # Album artwork URLs
    image_uri: Optional[str] = None
    thumbnail_uri: Optional[str] = None

    # MusicBrainz IDs
    artist_mbid: Optional[List[str]] = None
    recording_mbid: Optional[str] = None
    release_mbid: Optional[str] = None
    release_group_mbid: Optional[str] = None


class HybridSearchResponse(BaseModel):
    """Hybrid search response with BM25 + FAISS results."""

    results: List[HybridPlayResult]
    total: int
    query_time_ms: float
    query: str
    bm25_weight: float
    faiss_weight: float


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


# Enrichment models
class EnrichmentItem(BaseModel):
    """Single play enrichment item."""

    play_id: int
    data: dict  # JSON blob - flexible structure


class EnrichmentRequest(BaseModel):
    """Request to create enrichments from agent."""

    enrichment_type: str
    enrichments: List[EnrichmentItem]


class EnrichmentResponse(BaseModel):
    """Response from enrichment creation."""

    status: str
    count: int


class BatchPlaysResponse(BaseModel):
    """Response for batch play fetch."""

    plays: List[PlayResult]


class EnrichmentData(BaseModel):
    """Single enrichment with metadata."""

    id: int
    play_id: int
    enrichment_type: str
    data: dict
    created_at: str
    updated_at: str


class GetEnrichmentsResponse(BaseModel):
    """Response for fetching enrichments."""

    enrichments: List[EnrichmentData]
    total: int


class PlayCountResponse(BaseModel):
    """Response for play count queries."""

    count: int = Field(description="Number of matching plays")
    entity_type: Optional[str] = Field(None, description="Type of entity filtered (artist, recording, etc)")
    mbid: Optional[str] = Field(None, description="MBID that was filtered")
    query_time_ms: float = Field(description="Query execution time in milliseconds")
