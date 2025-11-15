"""Integration tests for FastAPI application."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import numpy as np


@pytest.fixture
def mock_services():
    """Mock search and database services."""
    with patch('app.main.search_service') as mock_search, \
         patch('app.main.db_service') as mock_db:

        # Mock search service
        mock_search.embeddings = np.zeros((100, 256))
        mock_search.index = Mock()
        mock_search.play_ids = np.arange(100)
        mock_search.search.return_value = (
            np.array([0, 1, 2]),
            np.array([0.9, 0.8, 0.7])
        )
        mock_search.get_play_ids.return_value = np.array([1, 2, 3])

        # Mock database service
        mock_db.get_plays_by_ids.return_value = {
            1: {'id': 1, 'artist': 'Test', 'song': 'Song 1', 'labels': []},
            2: {'id': 2, 'artist': 'Test', 'song': 'Song 2', 'labels': []},
            3: {'id': 3, 'artist': 'Test', 'song': 'Song 3', 'labels': []},
        }
        mock_db.get_play_by_id.return_value = {
            'id': 1, 'artist': 'Test', 'song': 'Song 1', 'labels': []
        }

        yield mock_search, mock_db


def test_health_endpoint(mock_services):
    """Test health check endpoint."""
    from app.main import app
    client = TestClient(app)

    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'
    assert 'memory_usage_mb' in data


def test_search_endpoint_valid(mock_services):
    """Test search endpoint with valid query."""
    from app.main import app
    client = TestClient(app)

    response = client.post(
        "/api/search",
        json={"query": "psychedelic rock", "limit": 10, "offset": 0}
    )

    assert response.status_code == 200
    data = response.json()
    assert 'results' in data
    assert 'total' in data
    assert 'query_time_ms' in data
    assert data['query'] == "psychedelic rock"


def test_search_endpoint_validation_error(mock_services):
    """Test search endpoint with invalid query."""
    from app.main import app
    client = TestClient(app)

    response = client.post(
        "/api/search",
        json={"query": "", "limit": 10}
    )

    assert response.status_code == 422  # Validation error


def test_get_play_endpoint(mock_services):
    """Test get play by ID endpoint."""
    from app.main import app
    client = TestClient(app)

    response = client.get("/api/plays/1")

    assert response.status_code == 200
    data = response.json()
    assert data['id'] == 1
    assert data['artist'] == 'Test'


def test_cache_headers_health_endpoint(mock_services):
    """Test cache headers on health endpoint (30 seconds)."""
    from app.main import app
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert "Cache-Control" in response.headers
    assert response.headers["Cache-Control"] == "public, max-age=30"
    assert response.headers["Vary"] == "Accept-Encoding"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_cache_headers_search_endpoint(mock_services):
    """Test cache headers on search endpoint (1 week)."""
    from app.main import app
    client = TestClient(app)

    response = client.post(
        "/api/search",
        json={"query": "test", "limit": 10, "offset": 0}
    )

    assert response.status_code == 200
    assert "Cache-Control" in response.headers
    assert response.headers["Cache-Control"] == "public, max-age=604800"
    assert response.headers["Vary"] == "Accept-Encoding"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_cache_headers_play_endpoint(mock_services):
    """Test cache headers on single play endpoint (1 week)."""
    from app.main import app
    client = TestClient(app)

    response = client.get("/api/plays/1")

    assert response.status_code == 200
    assert "Cache-Control" in response.headers
    assert response.headers["Cache-Control"] == "public, max-age=604800"
    assert response.headers["Vary"] == "Accept-Encoding"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_security_headers_all_endpoints(mock_services):
    """Test that security headers are applied to all endpoints."""
    from app.main import app
    client = TestClient(app)

    endpoints = [
        ("/api/health", "get"),
        ("/api/plays/1", "get"),
    ]

    for endpoint, method in endpoints:
        if method == "get":
            response = client.get(endpoint)

        assert response.status_code == 200
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"
