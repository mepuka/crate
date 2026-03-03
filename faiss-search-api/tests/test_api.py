"""API tests for FastAPI app wiring, auth, and key endpoints."""

from __future__ import annotations

from unittest.mock import Mock

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import main as app_main
from app.config import settings


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Create a TestClient with patched global services."""
    previous_search = app_main.search_service
    previous_hybrid = app_main.hybrid_search_service
    previous_db = app_main.db_service

    mock_search = Mock()
    mock_search.index = Mock()
    mock_search.index.ntotal = 2
    mock_search.embedding_dim = 384
    mock_search.search_and_map.return_value = (
        np.array([1, 2], dtype=np.int64),
        np.array([0.91, 0.87], dtype=np.float32),
    )

    mock_hybrid = Mock()
    mock_hybrid.search.return_value = []

    mock_db = Mock()
    db_cursor = Mock()
    db_cursor.fetchone.return_value = (1,)
    mock_db.conn.cursor.return_value = db_cursor
    mock_db.get_plays_by_ids.return_value = {
        1: {"id": 1, "artist": "A", "song": "S1", "labels": [], "show": 1},
        2: {"id": 2, "artist": "B", "song": "S2", "labels": [], "show": 1},
    }
    mock_db.get_daily_summary.return_value = None
    mock_db.save_daily_summary.return_value = 42
    mock_db.get_daily_research.return_value = None
    mock_db.save_daily_research.return_value = 11
    mock_db.bulk_insert_insights.return_value = []
    mock_db.get_insights.return_value = {"insights": [], "total": 0}
    mock_db.get_insights_for_play.return_value = []
    mock_db.get_insights_for_context.return_value = {"insights": [], "total": 0}

    app_main.search_service = mock_search
    app_main.hybrid_search_service = mock_hybrid
    app_main.db_service = mock_db
    app_main._data_health_cache_entry = None
    monkeypatch.setattr(settings, "REQUIRE_API_KEY", True)
    monkeypatch.delenv("FAISS_API_KEY", raising=False)

    test_client = TestClient(app_main.app)
    yield test_client

    app_main.search_service = previous_search
    app_main.hybrid_search_service = previous_hybrid
    app_main.db_service = previous_db
    app_main._data_health_cache_entry = None


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["database_connected"] is True


def test_search_endpoint_valid(client: TestClient) -> None:
    response = client.post(
        "/api/search",
        json={"query": "psychedelic rock", "limit": 10, "offset": 0},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "psychedelic rock"
    assert len(payload["results"]) == 2


def test_embeddings_router_registered(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/embeddings/add" in paths
    assert "/api/embeddings/pending" in paths
    assert "/api/embeddings/integrate" in paths


def test_summary_save_requires_api_key(client: TestClient) -> None:
    response = client.post(
        "/api/summary/save",
        json={
            "date": "2026-03-01",
            "summary": {"headline": "Test"},
            "research_id": 1,
        },
    )
    assert response.status_code == 503


def test_summary_save_with_valid_api_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_db = app_main.db_service
    mock_db.get_daily_summary.side_effect = [None, {"regenerated_count": 0}]
    mock_db.save_daily_summary.return_value = 100

    monkeypatch.setenv("FAISS_API_KEY", "test-key")
    response = client.post(
        "/api/summary/save",
        headers={"x-api-key": "test-key"},
        json={
            "date": "2026-03-01",
            "summary": {"headline": "Test"},
            "research_id": 1,
        },
    )
    assert response.status_code == 200
    assert response.json()["id"] == 100


def test_insights_create_requires_api_key(client: TestClient) -> None:
    response = client.post("/api/insights", json={"insights": []})
    assert response.status_code == 503


def test_data_health_uses_short_term_cache(client: TestClient) -> None:
    mock_db = app_main.db_service
    cursor = mock_db.conn.cursor.return_value
    cursor.execute.reset_mock()
    cursor.fetchone.side_effect = [
        (2_100_000,),  # fact_plays
        (0,),  # insights
        (68_000,),  # mb_artists
        (163_000,),  # mb_recordings
        (1_800_000,),  # play_artists
        ("2026-03-02T12:00:00Z",),  # latest play date
    ]

    first = client.get("/api/health/data")
    second = client.get("/api/health/data")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["status"] == "healthy"
    assert second.json()["status"] == "healthy"
    # Only first request should hit SQLite because second response is cached.
    assert cursor.execute.call_count == 6
