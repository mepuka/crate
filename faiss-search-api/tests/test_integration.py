"""
Integration test with real data files.

This test requires actual data files to be present in data/ directory.
Skip if running in CI without data.
"""
import pytest
from pathlib import Path

# Check if data files exist before importing services (to avoid import errors)
DATA_FILES_EXIST = all([
    Path("data/embeddings_256d.npy").exists(),
    Path("data/play_ids.npy").exists(),
    Path("data/pca_transformer_256d.joblib").exists(),
    Path("data/embeddings_256d.index").exists(),
    Path("data/metadata.json").exists(),
    Path("data/music_kb.sqlite").exists(),
])


@pytest.mark.skipif(
    not DATA_FILES_EXIST,
    reason="Integration test requires real data files in data/ directory"
)
def test_full_search_pipeline():
    """Test complete search pipeline with real data."""
    # Import services only when running the test (to avoid import errors when skipping)
    from app.services.search_service import FAISSSearchService
    from app.services.db_service import DatabaseService
    from app.config import settings

    # Initialize services
    search_svc = FAISSSearchService(
        embeddings_path=settings.EMBEDDINGS_PATH,
        play_ids_path=settings.PLAY_IDS_PATH,
        pca_path=settings.PCA_PATH,
        index_path=settings.INDEX_PATH,
        metadata_path=settings.METADATA_PATH
    )
    search_svc.initialize()

    db_svc = DatabaseService(settings.DATABASE_PATH)

    # Perform search
    query = "psychedelic rock"
    faiss_indices, distances = search_svc.search(query, k=10)

    # Map to play IDs
    play_ids = search_svc.get_play_ids(faiss_indices)

    # Fetch from database
    plays = db_svc.get_plays_by_ids(play_ids.tolist())

    # Verify results
    assert len(play_ids) == 10
    assert len(plays) > 0
    assert all(0.0 <= d <= 1.0 for d in distances)

    # Verify alignment
    for play_id in play_ids:
        assert int(play_id) in plays or play_id in plays

    db_svc.close()

    print(f"\n✓ Integration test passed")
    print(f"  Query: '{query}'")
    print(f"  Results: {len(plays)}")
    print(f"  Top similarity: {distances[0]:.4f}")
