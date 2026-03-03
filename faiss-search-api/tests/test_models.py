"""Tests for Pydantic models."""

import pytest
from pydantic import ValidationError

from app.models import HealthResponse, PlayResult, SearchRequest, SearchResponse


def test_search_request_valid():
    """Test valid search request."""
    req = SearchRequest(query="psychedelic rock", limit=20, offset=0)
    assert req.query == "psychedelic rock"
    assert req.limit == 20
    assert req.offset == 0


def test_search_request_defaults():
    """Test search request with defaults."""
    req = SearchRequest(query="test")
    assert req.limit == 20
    assert req.offset == 0


def test_search_request_validation_empty_query():
    """Test that empty query is rejected."""
    with pytest.raises(ValidationError):
        SearchRequest(query="", limit=20)


def test_search_request_validation_whitespace_only():
    """Test that whitespace-only query is rejected."""
    with pytest.raises(ValidationError):
        SearchRequest(query="   ", limit=20)


def test_search_request_validation_limit_bounds():
    """Test limit validation."""
    with pytest.raises(ValidationError):
        SearchRequest(query="test", limit=0)  # Too small

    with pytest.raises(ValidationError):
        SearchRequest(query="test", limit=101)  # Too large


def test_play_result_creation():
    """Test PlayResult model."""
    play = PlayResult(
        id=123,
        artist="Test Artist",
        song="Test Song",
        similarity=0.85,
        show=42,
    )
    assert play.id == 123
    assert play.similarity == 0.85
    assert play.labels == []  # Default


def test_search_response_creation():
    """Test SearchResponse model."""
    play = PlayResult(id=1, artist="A", song="S", similarity=0.9, show=1)
    response = SearchResponse(results=[play], total=1, query_time_ms=15.3, query="test")
    assert len(response.results) == 1
    assert response.total == 1
    assert response.query_time_ms == 15.3


def test_health_response_creation():
    """Test HealthResponse model."""
    health = HealthResponse(
        status="ok",
        index_loaded=True,
        database_connected=True,
        total_vectors=2193235,
        embedding_dimension=384,
        memory_usage_mb=2847.3,
        uptime_seconds=3600.5,
    )
    assert health.status == "ok"
    assert health.total_vectors == 2193235
