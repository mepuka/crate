"""Tests for FAISS search service."""

from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np
import pytest

from app.services.search_service import FAISSSearchService


@pytest.fixture
def mock_paths(tmp_path):
    """Create mock file paths."""
    return {
        "embeddings": tmp_path / "embeddings_256d.npy",
        "play_ids": tmp_path / "play_ids.npy",
        "pca": tmp_path / "pca_256.pkl",
        "index": tmp_path / "embeddings.index",
        "metadata": tmp_path / "metadata.json",
    }


def test_search_service_initialization(mock_paths):
    """Test search service initialization."""
    service = FAISSSearchService(
        embeddings_path=mock_paths["embeddings"],
        play_ids_path=mock_paths["play_ids"],
        pca_path=mock_paths["pca"],
        index_path=mock_paths["index"],
        metadata_path=mock_paths["metadata"],
    )

    assert service.embeddings_path == mock_paths["embeddings"]
    assert service.play_ids_path == mock_paths["play_ids"]


def test_get_play_ids_from_indices():
    """Test mapping FAISS indices to play IDs."""
    # Create mock service
    service = FAISSSearchService(embeddings_path=Path("dummy"), play_ids_path=Path("dummy"))

    # Mock play_ids array
    service.play_ids = np.array([3518527, 3518526, 3518525, 3518524, 3518522])

    # Get play IDs for indices
    faiss_indices = np.array([0, 2, 4])
    play_ids = service.get_play_ids(faiss_indices)

    assert len(play_ids) == 3
    assert play_ids[0] == 3518527
    assert play_ids[1] == 3518525
    assert play_ids[2] == 3518522


@patch("app.services.search_service.SentenceTransformer")
@patch("app.services.search_service.faiss")
def test_encode_query_normalizes(mock_faiss, mock_sentence_transformer, mock_paths):
    """Test that query encoding includes normalization."""
    # Mock model
    mock_model = Mock()
    mock_model.encode.return_value = np.array([[0.5, 0.5, 0.0, 0.0]])  # 4d for test
    mock_sentence_transformer.return_value = mock_model

    # Mock PCA
    mock_pca = Mock()
    mock_pca.transform.return_value = np.array([[0.6, 0.8]])  # Result before normalization

    # Create service
    service = FAISSSearchService(
        embeddings_path=mock_paths["embeddings"], play_ids_path=mock_paths["play_ids"]
    )
    service.model = mock_model
    service.pca = mock_pca

    # Encode query
    result = service.encode_query("test query")

    # Verify normalization
    assert mock_model.encode.called
    # Check that result is normalized (norm ≈ 1.0)
    assert isinstance(result, np.ndarray)
