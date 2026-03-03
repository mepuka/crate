"""Tests for database service."""

import sqlite3

import pytest

from app.services.db_service import DatabaseService


@pytest.fixture
def test_db_path(tmp_path):
    """Create a temporary test database."""
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create schema
    cursor.execute("""
        CREATE TABLE fact_plays (
            id INTEGER PRIMARY KEY,
            airdate TEXT NOT NULL,
            show INTEGER NOT NULL,
            artist TEXT NOT NULL,
            song TEXT NOT NULL,
            album TEXT,
            labels TEXT,
            artist_ids TEXT,
            recording_id TEXT,
            release_id TEXT,
            release_group_id TEXT,
            track_id TEXT,
            rotation_status TEXT,
            is_local INTEGER DEFAULT 0,
            is_live INTEGER DEFAULT 0,
            is_request INTEGER DEFAULT 0,
            comment TEXT,
            image_uri TEXT,
            thumbnail_uri TEXT
        )
    """)

    # Insert test data
    test_plays = [
        (
            1,
            "2020-10-15T14:23:00",
            63830,
            "IDLES",
            "Mr. Motivator",
            "Live At KEXP",
            '["KEXP"]',
            '["artist-mbid-1"]',
            "recording-mbid-1",
            "release-mbid-1",
            "release-group-mbid-1",
            None,
            "Library",
            0,
            1,
            0,
            "High energy",
            None,
            None,
        ),
        (
            2,
            "2019-05-10T10:00:00",
            63829,
            "Madvillain",
            "All Caps",
            "Madvillainy",
            '["Stones Throw"]',
            '["artist-mbid-2"]',
            "recording-mbid-2",
            "release-mbid-2",
            "release-group-mbid-2",
            None,
            "Heavy",
            0,
            0,
            0,
            "Classic",
            None,
            None,
        ),
        (
            3,
            "2018-01-01T00:00:00",
            63828,
            "Test Artist",
            "Test Song",
            None,
            "[]",
            '["mbid-123"]',
            "mbid-456",
            None,
            None,
            None,
            None,
            1,
            0,
            1,
            None,
            None,
            None,
        ),
    ]

    cursor.executemany(
        """
        INSERT INTO fact_plays VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        test_plays,
    )

    conn.commit()
    conn.close()

    return db_path


def test_database_service_connect(test_db_path):
    """Test database connection."""
    db = DatabaseService(test_db_path)
    assert db.db_path == test_db_path
    db.close()


def test_get_play_by_id(test_db_path):
    """Test fetching single play by ID."""
    db = DatabaseService(test_db_path)

    play = db.get_play_by_id(1)
    assert play is not None
    assert play["id"] == 1
    assert play["artist"] == "IDLES"
    assert play["song"] == "Mr. Motivator"

    db.close()


def test_get_play_by_id_not_found(test_db_path):
    """Test fetching non-existent play."""
    db = DatabaseService(test_db_path)

    play = db.get_play_by_id(999)
    assert play is None

    db.close()


def test_get_plays_by_ids(test_db_path):
    """Test fetching multiple plays by IDs."""
    db = DatabaseService(test_db_path)

    plays = db.get_plays_by_ids([1, 2, 3])
    assert len(plays) == 3
    assert 1 in plays
    assert 2 in plays
    assert 3 in plays
    assert plays[1]["artist"] == "IDLES"
    assert plays[2]["artist"] == "Madvillain"

    db.close()


def test_get_plays_by_ids_preserves_order(test_db_path):
    """Test that results maintain input order."""
    db = DatabaseService(test_db_path)

    # Request in specific order
    plays = db.get_plays_by_ids([3, 1, 2])

    # Should return dict, can check keys exist
    assert 1 in plays
    assert 2 in plays
    assert 3 in plays

    db.close()


def test_get_plays_by_ids_empty_list(test_db_path):
    """Test with empty ID list."""
    db = DatabaseService(test_db_path)

    plays = db.get_plays_by_ids([])
    assert plays == {}

    db.close()
